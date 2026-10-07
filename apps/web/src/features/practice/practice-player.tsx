'use client';

import { HelpCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  BLOCK_LABELS,
  REASON_LABELS,
  type ClientExercise,
  type ExerciseFormat,
  type SelectionReason,
  type SessionBlock,
} from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SkillChip, type Mode } from '@/components/ui/skill-chip';
import { Spark } from '@/components/ui/spark';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { FeedbackPanel } from './feedback-panel';
import { hasSeenHowTo, HowToCard, markHowToSeen } from './how-to-card';
import { useSubmitAttempt } from './hooks';
import { currentExercise, initialState, playerReducer, type StepRecord } from './player-state';
import { FORMAT_UI } from './registry';
import { PracticeSummary } from './summary';

const SKILL_MODE: Record<string, Mode> = {
  VOCABULARY: 'vocabulary',
  GRAMMAR: 'grammar',
  COLLOCATION: 'collocations',
  WORD_FORMATION: 'formation',
  EXPRESSION: 'expressions',
};

const newAttemptId = () => crypto.randomUUID();
const initialFor = (exercise: ClientExercise | undefined): unknown =>
  exercise ? FORMAT_UI[exercise.format].initial(exercise.content as never) : null;

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
}

/** An exercise that may belong to a daily session (then it carries its slot, block and reason). */
export type PlayableExercise = ClientExercise & {
  sessionItemId?: string;
  block?: SessionBlock;
  reason?: SelectionReason;
};

interface PracticePlayerProps {
  run: { exercises: PlayableExercise[] };
  /** Start again with a freshly built run. */
  onAgain: () => void;
  backHref: string;
  /** Replaces the default summary (the daily session shows XP and streak instead). */
  renderDone?: (ctx: { exercises: ClientExercise[]; steps: StepRecord[]; elapsedSeconds: number }) => ReactNode;
}

export function PracticePlayer({ run, onAgain, backHref, renderDone }: PracticePlayerProps) {
  const router = useRouter();
  const submitAttempt = useSubmitAttempt();
  const startedAt = useRef(Date.now());
  const [state, dispatch] = useReducer(
    playerReducer,
    undefined,
    () => initialState(run.exercises, initialFor(run.exercises[0]), newAttemptId(), Date.now()),
  );
  const [howToOpen, setHowToOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const exercise = currentExercise(state);
  const ui = exercise ? FORMAT_UI[exercise.format] : null;
  const isLast = state.index >= state.exercises.length - 1;
  const answering = state.phase === 'answering';
  const ready = Boolean(exercise && ui && answering && !ui.autoSubmit && ui.isReady(state.value as never, exercise.content as never));

  // Each new question: show its "how this works" card the first time that format appears.
  useEffect(() => {
    if (exercise) setHowToOpen(!hasSeenHowTo(exercise.format));
  }, [exercise?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const closeHowTo = (format: ExerciseFormat) => {
    markHowToSeen(format);
    setHowToOpen(false);
  };

  /** Sends an answer. If it fails, the learner is back at the question and can retry or skip. */
  const send = useCallback(
    async (value: unknown) => {
      if (state.phase !== 'answering' || !exercise) return;
      dispatch({ type: 'change', value });
      dispatch({ type: 'submit' });
      try {
        const result = await submitAttempt.mutateAsync({
          clientAttemptId: state.attemptId,
          exerciseId: exercise.id,
          response: value,
          durationMs: Date.now() - state.shownAt,
          sessionItemId: (exercise as PlayableExercise).sessionItemId,
        });
        dispatch({ type: 'submitted', result });
      } catch (error) {
        dispatch({ type: 'failed', message: errorMessage(error, 'We could not check that answer. Please try again.') });
      }
    },
    [state.phase, state.attemptId, state.shownAt, exercise, submitAttempt],
  );

  const goNext = useCallback(() => {
    const next = state.exercises[state.index + 1];
    dispatch({ type: 'next', initialValue: initialFor(next), attemptId: newAttemptId(), now: Date.now() });
  }, [state.exercises, state.index]);

  const skip = () => {
    const next = state.exercises[state.index + 1];
    dispatch({ type: 'skip', initialValue: initialFor(next), attemptId: newAttemptId(), now: Date.now() });
  };

  const check = useCallback(() => {
    if (ready) void send(state.value);
  }, [ready, send, state.value]);

  // Flashcards have no right or wrong to show: move straight on after the rating.
  useEffect(() => {
    if (state.phase !== 'feedback' || exercise?.format !== 'flashcard') return;
    const t = setTimeout(goNext, 280);
    return () => clearTimeout(t);
  }, [state.phase, exercise?.format, goNext]);

  // Enter checks (or continues). Inputs call `check` themselves, so typing is never interrupted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('button, a, summary')) return;
      if (state.phase === 'feedback' && exercise?.format !== 'flashcard') goNext();
      else check();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, exercise?.format, goNext, check]);

  // Clock for the summary.
  useEffect(() => {
    if (state.phase === 'done') setElapsed(Math.round((Date.now() - startedAt.current) / 1000));
  }, [state.phase]);

  if (state.phase === 'done') {
    if (renderDone) return <>{renderDone({ exercises: state.exercises, steps: state.steps, elapsedSeconds: elapsed })}</>;
    return (
      <PracticeSummary exercises={state.exercises} steps={state.steps} elapsedSeconds={elapsed} onAgain={onAgain} backHref={backHref} />
    );
  }
  if (!exercise || !ui) return null;

  const Renderer = ui.Component;
  const content = exercise.content as { instruction: string; helper?: string };
  const mode = SKILL_MODE[exercise.skill] ?? 'review';
  const locked = !answering;
  const checking = state.phase === 'submitting';

  // Daily session: say which block we are in, once at its start, and why this exercise is here.
  const { block, reason } = exercise as PlayableExercise;
  const previous = state.exercises[state.index - 1] as PlayableExercise | undefined;
  const newBlock = Boolean(block) && (state.index === 0 || previous?.block !== block);
  const blockCount = state.exercises.filter((e) => (e as PlayableExercise).block === block).length;

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-10 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={() => setConfirmExit(true)}
            aria-label="Leave practice"
            className="grid size-10 shrink-0 place-items-center rounded-control text-mute transition-colors hover:bg-subtle hover:text-ink"
          >
            <X className="size-6" />
          </button>

          <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={state.exercises.length} aria-valuenow={state.index} aria-label="Progress">
            {state.exercises.map((e, i) => {
              const step = state.steps[i];
              const tone = step
                ? step.result === null
                  ? 'bg-line'
                  : step.result.verdict === 'correct'
                    ? 'bg-good'
                    : step.result.verdict === 'almost'
                      ? 'bg-flame'
                      : 'bg-bad'
                : i === state.index
                  ? 'bg-brand animate-pulse'
                  : 'bg-subtle';
              return <span key={e.id} className={cn('h-2.5 flex-1 rounded-full transition-colors duration-300', tone)} />;
            })}
          </div>

          <span className="w-12 shrink-0 text-right text-sm font-semibold text-mute">
            {state.index + 1}/{state.exercises.length}
          </span>
          <button
            type="button"
            onClick={() => (howToOpen ? closeHowTo(exercise.format) : setHowToOpen(true))}
            aria-label="How does this exercise work?"
            aria-pressed={howToOpen}
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-control transition-colors',
              howToOpen ? 'bg-brand-soft text-brand' : 'text-mute hover:bg-subtle hover:text-ink',
            )}
          >
            <HelpCircle className="size-6" />
          </button>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl space-y-6 px-5 pb-10 pt-8">
          {block && newBlock && (
            <div key={block} className="flex animate-[slide-up_260ms_ease-out] items-center gap-3 rounded-2xl bg-ink px-5 py-3 text-white">
              <span className="font-heading text-lg font-extrabold">{BLOCK_LABELS[block]}</span>
              <span className="text-base text-white/70">
                {blockCount} exercise{blockCount === 1 ? '' : 's'}
              </span>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <SkillChip mode={mode} label={`${exercise.items.length > 1 ? 'Review' : exercise.items[0]?.headword ?? ''}`} />
              {reason && (
                <span className="rounded-full bg-subtle px-3 py-1.5 text-sm font-semibold text-mute">{REASON_LABELS[reason]}</span>
              )}
            </div>
            <h1 className="font-heading text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">{content.instruction}</h1>
            {content.helper && <p className="text-lg text-mute">{content.helper}</p>}
          </div>

          {howToOpen && <HowToCard format={exercise.format} onClose={() => closeHowTo(exercise.format)} />}

          <div key={exercise.id} className="animate-[slide-up_240ms_ease-out]">
            <Renderer
              content={exercise.content}
              value={state.value}
              onChange={(value: unknown) => dispatch({ type: 'change', value })}
              locked={locked}
              result={state.result}
              sendNow={(value: unknown) => void send(value)}
              onEnter={check}
            />
          </div>
        </div>
      </main>

      <footer className="sticky bottom-0 z-10 border-t border-line bg-card/95 backdrop-blur">
        {state.phase === 'feedback' && state.result && exercise.format !== 'flashcard' ? (
          <FeedbackPanel result={state.result} isLast={isLast} onContinue={goNext} />
        ) : (
          <div className="mx-auto max-w-2xl space-y-3 px-5 py-4">
            {state.error && (
              <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-edge">
                {state.error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <Button variant="ghost" size="lg" onClick={skip} disabled={!answering}>
                Skip
              </Button>
              {ui.autoSubmit ? (
                <p className="text-base font-semibold text-mute">{ui.notReadyLabel}</p>
              ) : checking && ui.usesAi ? (
                <p className="flex items-center gap-3 text-lg font-semibold text-brand" aria-live="polite">
                  <Spark className="size-6 animate-spin [animation-duration:1.6s]" /> Checking your answer…
                </p>
              ) : (
                <Button size="lg" onClick={check} disabled={!ready} loading={checking} className="min-w-52">
                  {ready || checking ? 'Check' : ui.notReadyLabel}
                </Button>
              )}
            </div>
          </div>
        )}
      </footer>

      <ConfirmDialog
        open={confirmExit}
        onClose={() => setConfirmExit(false)}
        onConfirm={() => router.push(backHref)}
        title="Leave this practice?"
        description="Answers you already checked are saved. The rest of this set will be lost."
        confirmLabel="Leave"
      />
    </div>
  );
}
