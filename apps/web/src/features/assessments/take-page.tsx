'use client';

import { Clock, GraduationCap, ListChecks, Play, Swords, Timer } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssessmentDto } from '@coach/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spark } from '@/components/ui/spark';
import { ApiError } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { PracticePlayer, type AssessmentMode, type PlayableExercise } from '@/features/practice/practice-player';
import { useAssessment, useSaveAnswer, useStartAssessment, useSubmitAssessment } from './hooks';

function Centered({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto grid min-h-dvh max-w-xl place-items-center px-5 py-10">{children}</main>;
}

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));
const noun = (kind: AssessmentDto['kind']) => (kind === 'QUIZ' ? 'quiz' : 'exam');

function Intro({ dto, resuming, secondsLeft, starting, error, onStart }: {
  dto: AssessmentDto;
  resuming: boolean;
  secondsLeft: number | null;
  starting: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const remaining = dto.questions.filter((q) => !q.answered).length;
  const isQuiz = dto.kind === 'QUIZ';
  const boss = dto.preset === 'BOSS';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.repeat) onStart();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onStart]);

  const rules = boss
    ? ['A whole unit in one go, with no feedback until the end.', 'Score 80% or more to beat the boss and earn 50 bonus XP.', 'You can skip a question, and go back to the previous one to change your answer.']
    : isQuiz
    ? ['After each answer you see right away if it was correct.', 'Wrong answers go to your mistakes so they come back later.']
    : ['No feedback until the end, so you see what you really know.', 'You can skip a question, and go back to the previous one to change your answer.', 'Your score and the correct answers appear after you finish.'];

  return (
    <Centered>
      <Card className={`w-full space-y-7 p-8 sm:p-10 ${boss ? 'border-deep bg-deep text-white' : ''}`}>
        <div className="space-y-3 text-center">
          <span className={`mx-auto grid size-16 place-items-center rounded-2xl text-white ${boss ? 'bg-bad shadow-[0_4px_0_var(--bad-edge)]' : 'bg-brand shadow-[0_4px_0_var(--brand-edge)]'}`}>
            {boss ? <Swords className="size-8" /> : isQuiz ? <ListChecks className="size-8" /> : <GraduationCap className="size-8" />}
          </span>
          <p className={`text-sm font-semibold uppercase tracking-wide ${boss ? 'text-white/70' : 'text-mute'}`}>{boss ? 'Boss quiz' : isQuiz ? 'Quiz' : 'Exam'}</p>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">{dto.title.replace(/^(Quiz|Exam|Boss quiz) · /, '')}</h1>
        </div>

        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-subtle px-4 py-4 text-center">
            <dd className="font-heading text-3xl font-extrabold text-ink">{remaining}</dd>
            <dt className="text-sm font-semibold text-mute">{resuming ? 'questions left' : 'questions'}</dt>
          </div>
          <div className="rounded-2xl bg-subtle px-4 py-4 text-center">
            <dd className="font-heading text-3xl font-extrabold text-ink">
              {secondsLeft != null ? `${minutes(secondsLeft)} min` : '–'}
            </dd>
            <dt className="text-sm font-semibold text-mute">{resuming ? 'left' : 'time limit'}</dt>
          </div>
        </dl>

        <ul className={`space-y-2 text-lg ${boss ? 'text-white/80' : 'text-mute'}`}>
          {rules.map((rule) => (
            <li key={rule} className="flex gap-3">
              <Timer className="mt-1 size-5 shrink-0 text-brand" aria-hidden />
              <span>{rule}</span>
            </li>
          ))}
          <li className="flex gap-3">
            <Clock className="mt-1 size-5 shrink-0 text-brand" aria-hidden />
            <span>The clock starts when you press {resuming ? 'Continue' : 'Start'}, and it runs even if you leave.</span>
          </li>
        </ul>

        {error && (
          <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
            {error}
          </p>
        )}

        <div className="space-y-3 text-center">
          <Button size="lg" className="w-full" onClick={onStart} loading={starting} autoFocus>
            <Play className="size-5" fill="currentColor" /> {resuming ? 'Continue' : 'Start'}
          </Button>
          <Link href="/assessments" className={`inline-block text-base font-semibold ${boss ? 'text-white/70 hover:text-white' : 'text-mute hover:text-ink'}`}>
            Not now
          </Link>
        </div>
      </Card>
    </Centered>
  );
}

/** Hands the assessment in (once) and moves on to the result. */
function HandIn({ run, error, onRetry }: { run: () => void; error: string | null; onRetry: () => void }) {
  const called = useRef(false);
  useEffect(() => {
    if (called.current) return;
    called.current = true;
    run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) {
    return (
      <Centered>
        <Card role="alert" className="w-full space-y-4 border-bad/40 bg-bad-soft text-center">
          <p className="text-lg font-semibold text-bad-ink">{error}</p>
          <Button onClick={onRetry}>Try again</Button>
        </Card>
      </Centered>
    );
  }
  return (
    <Centered>
      <div className="space-y-4 text-center" aria-busy aria-live="polite">
        <Spark className="mx-auto size-14 animate-spin text-brand [animation-duration:1.8s]" />
        <p className="font-heading text-xl font-bold">Marking your answers…</p>
      </div>
    </Centered>
  );
}

export function TakePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const query = useAssessment(id);
  const start = useStartAssessment(id);
  const save = useSaveAnswer(id);
  const submit = useSubmitAssessment(id);
  const [started, setStarted] = useState(false);
  const [handingIn, setHandingIn] = useState(false);
  const [handInError, setHandInError] = useState<string | null>(null);

  // The server's clock is the one that counts: measure how far ours is from it when the data arrives.
  const dto = start.data ?? query.data;
  const offset = useRef(0);
  useEffect(() => {
    if (dto) offset.current = Date.parse(dto.serverNow) - Date.now();
  }, [dto]);

  const secondsLeft = (d: AssessmentDto): number | null => {
    if (d.timeLimitSec == null) return null;
    if (!d.startedAt) return d.timeLimitSec;
    const end = Date.parse(d.startedAt) + d.timeLimitSec * 1000;
    return Math.max(0, Math.round((end - (Date.now() + offset.current)) / 1000));
  };

  useEffect(() => {
    if (dto?.status === 'GRADED') router.replace(`/assessments/${id}`);
  }, [dto?.status, id, router]);

  const finish = async () => {
    setHandInError(null);
    setHandingIn(true);
    try {
      await submit.mutateAsync();
      router.replace(`/assessments/${id}`);
    } catch (error) {
      setHandInError(errorMessage(error, 'We could not hand it in. Please try again.'));
    }
  };

  const mode: AssessmentMode | null = useMemo(() => {
    if (!dto) return null;
    return {
      noun: noun(dto.kind),
      hideFeedback: dto.feedback === 'END',
      secondsLeft: secondsLeft(dto),
      onTimeUp: () => void finish(),
      send: async ({ exercise, value, durationMs }) => {
        try {
          const saved = await save.mutateAsync({ questionId: exercise.assessmentQuestionId!, response: value, durationMs });
          return saved.result;
        } catch (error) {
          // The server ran out of time before our clock did: it has already handed in what was saved.
          if (error instanceof ApiError && error.status === 409 && /time is up/i.test(error.message)) void finish();
          throw error;
        }
      },
    };
  }, [dto?.id, started]); // eslint-disable-line react-hooks/exhaustive-deps

  if (query.isError) {
    return (
      <Centered>
        <Card role="alert" className="w-full space-y-4 border-bad/40 bg-bad-soft text-center">
          <p className="text-lg font-semibold text-bad-ink">{errorMessage(query.error, 'We could not open this.')}</p>
          <Link href="/assessments" className={buttonClass('secondary', 'md')}>
            Back
          </Link>
        </Card>
      </Centered>
    );
  }
  if (!dto || dto.status === 'GRADED') {
    return (
      <Centered>
        <Spark className="size-14 animate-spin text-brand [animation-duration:1.8s]" />
      </Centered>
    );
  }

  const unanswered = dto.questions.filter((q) => !q.answered);
  if (handingIn || (started && unanswered.length === 0) || (dto.status === 'IN_PROGRESS' && unanswered.length === 0)) {
    return <HandIn run={() => void finish()} error={handInError} onRetry={() => void finish()} />;
  }

  if (!started) {
    return (
      <Intro
        dto={dto}
        resuming={dto.status === 'IN_PROGRESS'}
        secondsLeft={secondsLeft(dto)}
        starting={start.isPending}
        error={start.isError ? errorMessage(start.error, 'We could not start.') : null}
        onStart={() => {
          if (dto.status === 'IN_PROGRESS') setStarted(true);
          else start.mutate(undefined, { onSuccess: () => setStarted(true) });
        }}
      />
    );
  }

  const exercises: PlayableExercise[] = unanswered.map((q) => ({ ...q.exercise, assessmentQuestionId: q.id }));
  return (
    <PracticePlayer
      key={dto.id}
      run={{ exercises }}
      onAgain={() => router.replace('/assessments')}
      backHref="/assessments"
      assessment={mode ?? undefined}
      renderDone={() => <HandIn run={() => void finish()} error={handInError} onRetry={() => void finish()} />}
    />
  );
}
