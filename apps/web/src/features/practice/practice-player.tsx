'use client';

import { Clock, HelpCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import {
  BLOCK_LABELS,
  REASON_LABELS,
  type AttemptResult,
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

/** What kind of language the exercise is about. Never the word itself: for some exercises that word is the answer. */
const SKILL_LABEL: Record<string, string> = {
  VOCABULARY: 'Vocabulary',
  GRAMMAR: 'Grammar',
  COLLOCATION: 'Collocation',
  WORD_FORMATION: 'Word formation',
  EXPRESSION: 'Expression',
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
  /** Set when the exercise is a question of a quiz or an exam. */
  assessmentQuestionId?: string;
};

/** What an exam gets back for an answer: nothing to show, just "kept". Never displayed. */
const KEPT: AttemptResult = {
  attemptId: '',
  verdict: 'correct',
  isCorrect: true,
  score: 0,
  correctAnswerText: null,
  explanationFa: null,
  errorCodes: [],
  detail: {},
  xp: 0,
  itemUpdates: [],
};

/** Turns the player into a quiz or exam player: answers go to the assessment, and a clock runs. */
export interface AssessmentMode {
  /** Sends one answer. A quiz returns the checked result; an exam returns null. */
  send: (input: { exercise: PlayableExercise; value: unknown; durationMs: number }) => Promise<AttemptResult | null>;
  /** An exam says nothing about an answer until the end. */
  hideFeedback: boolean;
  /** Seconds left when the player opens, or null for no clock. */
  secondsLeft: number | null;
  /** Called once when the clock runs out. */
  onTimeUp: () => void;
  noun: 'quiz' | 'exam';
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** Counts down to a moment fixed when it first renders, so re-renders cannot add or lose time. */
function Countdown({ seconds, onTimeUp }: { seconds: number; onTimeUp: () => void }) {
  const deadline = useRef(Date.now() + seconds * 1000);
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);
  const callback = useRef(onTimeUp);
  callback.current = onTimeUp;

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining === 0 && !fired.current) {
        fired.current = true;
        callback.current();
      }
    };
    tick();
    const t = setInterval(tick, 500);
    return () => clearInterval(t);
  }, []);

  return (
    <span
      role="timer"
      aria-label={`${clock(left)} left`}
      className={cn(
        'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 font-heading text-base font-extrabold tabular-nums',
        left <= 20 ? 'animate-pulse bg-bad-soft text-bad-edge' : left <= 60 ? 'bg-flame/15 text-[#b36b00]' : 'bg-subtle text-ink',
      )}
    >
      <Clock className="size-4" /> {clock(left)}
    </span>
  );
}

interface PracticePlayerProps {
  run: { exercises: PlayableExercise[] };
  /** Start again with a freshly built run. */
  onAgain: () => void;
  backHref: string;
  /** Replaces the default summary (the daily session shows XP and streak instead). */
  renderDone?: (ctx: { exercises: ClientExercise[]; steps: StepRecord[]; elapsedSeconds: number }) => ReactNode;
  /** Set for a quiz or an exam. */
  assessment?: AssessmentMode;
}

export function PracticePlayer({ run, onAgain, backHref, renderDone, assessment }: PracticePlayerProps) {
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
        const durationMs = Date.now() - state.shownAt;
        const result = assessment
          ? ((await assessment.send({ exercise: exercise as PlayableExercise, value, durationMs })) ?? KEPT)
          : await submitAttempt.mutateAsync({
              clientAttemptId: state.attemptId,
              exerciseId: exercise.id,
              response: value,
              durationMs,
              sessionItemId: (exercise as PlayableExercise).sessionItemId,
            });
        dispatch({ type: 'submitted', result });
      } catch (error) {
        dispatch({ type: 'failed', message: errorMessage(error, 'We could not check that answer. Please try again.') });
      }
    },
    [state.phase, state.attemptId, state.shownAt, exercise, submitAttempt, assessment],
  );

  const goNext = useCallback(() => {
    const next = state.exercises[state.index + 1];
    dispatch({ type: 'next', initialValue: initialFor(next), attemptId: newAttemptId(), now: Date.now() });
  }, [state.exercises, state.index]);

  const goBack = () => {
    const previous = state.exercises[state.index - 1];
    if (!previous) return;
    dispatch({ type: 'back', value: state.values[state.index - 1] ?? initialFor(previous), attemptId: newAttemptId(), now: Date.now() });
  };

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

  // An exam never shows a verdict: once the answer is kept, go straight to the next question.
  useEffect(() => {
    if (state.phase !== 'feedback' || !assessment?.hideFeedback) return;
    const t = setTimeout(goNext, 120);
    return () => clearTimeout(t);
  }, [state.phase, assessment?.hideFeedback, goNext]);

  // Enter checks (or continues). Inputs call `check` themselves, so typing is never interrupted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.target instanceof HTMLElement && e.target.closest('button, a, summary')) return;
      if (state.phase === 'feedback' && exercise?.format !== 'flashcard' && !assessment?.hideFeedback) goNext();
      else check();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.phase, exercise?.format, assessment?.hideFeedback, goNext, check]);

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
            aria-label={assessment ? `Leave this ${assessment.noun}` : 'Leave practice'}
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
                  : assessment?.hideFeedback
                    ? 'bg-brand'
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

          {assessment?.secondsLeft != null && <Countdown seconds={assessment.secondsLeft} onTimeUp={assessment.onTimeUp} />}
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
              <SkillChip mode={mode} label={exercise.items.length > 1 ? 'Review' : (SKILL_LABEL[exercise.skill] ?? 'Review')} />
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
        {state.phase === 'feedback' && state.result && exercise.format !== 'flashcard' && !assessment?.hideFeedback ? (
          <FeedbackPanel result={state.result} isLast={isLast} onContinue={goNext} />
        ) : (
          <div className="mx-auto max-w-2xl space-y-3 px-5 py-4">
            {state.error && (
              <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-edge">
                {state.error}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                {assessment?.hideFeedback && state.index > 0 && (
                  <Button variant="ghost" size="lg" onClick={goBack} disabled={!answering}>
                    Back
                  </Button>
                )}
                <Button variant="ghost" size="lg" onClick={skip} disabled={!answering}>
                  Skip
                </Button>
              </div>
              {ui.autoSubmit ? (
                <p className="text-base font-semibold text-mute">{ui.notReadyLabel}</p>
              ) : checking && ui.usesAi ? (
                <p className="flex items-center gap-3 text-lg font-semibold text-brand" aria-live="polite">
                  <Spark className="size-6 animate-spin [animation-duration:1.6s]" /> Checking your answer…
                </p>
              ) : (
                <Button size="lg" onClick={check} disabled={!ready} loading={checking} className="min-w-52">
                  {ready || checking ? (assessment?.hideFeedback ? 'Next' : 'Check') : ui.notReadyLabel}
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
        title={assessment ? `Leave this ${assessment.noun}?` : 'Leave this practice?'}
        description={
          assessment
            ? 'Your answers so far are kept, but the clock keeps running. You can come back and continue until time is up.'
            : 'Answers you already checked are saved. The rest of this set will be lost.'
        }
        confirmLabel="Leave"
      />
    </div>
  );
}
