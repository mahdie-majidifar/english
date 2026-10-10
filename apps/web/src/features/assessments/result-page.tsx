'use client';

import { ArrowRight, Check, CircleAlert, Clock, Flag, Star, Swords, X } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { AssessmentResultDto, ReviewQuestionDto } from '@coach/contracts';
import { NewAchievements } from '@/components/ui/achievement-badge';
import { CountUp } from '@/components/ui/count-up';
import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScoreRing } from '@/components/ui/score-ring';
import { Spark } from '@/components/ui/spark';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { useAssessmentResult } from './hooks';

const VERDICT = {
  correct: { icon: Check, tone: 'bg-good text-white', label: 'Correct' },
  almost: { icon: CircleAlert, tone: 'bg-flame text-white', label: 'Almost' },
  wrong: { icon: X, tone: 'bg-bad text-white', label: 'Wrong' },
} as const;

function ReviewRow({ q }: { q: ReviewQuestionDto }) {
  const v = q.verdict ? VERDICT[q.verdict] : null;
  const content = q.exercise.content as { instruction?: string };
  const subject = q.exercise.items.length > 1 ? 'Review' : (q.exercise.items[0]?.headword ?? '');
  return (
    <Card className="space-y-3 p-5">
      <div className="flex items-start gap-4">
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-full', v ? v.tone : 'bg-subtle text-mute')}>
          {v ? <v.icon className="size-5" strokeWidth={3} /> : <span className="font-heading text-sm font-bold">–</span>}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold uppercase tracking-wide text-mute">
            Question {q.position} · {v ? v.label : 'Not answered'}
          </p>
          <h3 className="mt-0.5 font-heading text-xl font-extrabold tracking-tight">{subject}</h3>
          {content.instruction && <p className="mt-0.5 text-base text-mute">{content.instruction}</p>}
        </div>
      </div>

      {q.answered && q.yourAnswer && (
        <p className="rounded-2xl bg-subtle px-4 py-3 text-lg">
          <span className="font-medium text-mute">Your answer: </span>
          <bdi className={cn('font-semibold', q.verdict === 'correct' ? 'text-good-edge' : 'text-bad-edge')}>{q.yourAnswer}</bdi>
        </p>
      )}
      {q.correctAnswerText && (
        <p className="rounded-2xl bg-good-soft px-4 py-3 text-lg">
          <span className="font-medium text-mute">Correct answer: </span>
          <bdi className="whitespace-pre-line font-semibold text-good-edge">{q.correctAnswerText}</bdi>
        </p>
      )}
      {q.explanationFa && <p className="fa text-lg">{q.explanationFa}</p>}
      {q.errorLabels.length > 0 && (
        <p className="flex flex-wrap gap-2">
          {q.errorLabels.map((l) => (
            <span key={l} className="rounded-full bg-subtle px-3 py-0.5 text-sm font-semibold text-mute">
              {l}
            </span>
          ))}
        </p>
      )}
    </Card>
  );
}

function Result({ result }: { result: AssessmentResultDto }) {
  const [filter, setFilter] = useState<'all' | 'missed'>('missed');
  const missed = result.review.filter((q) => q.verdict !== 'correct');
  const shown = filter === 'all' ? result.review : missed;
  const minutes = Math.max(1, Math.round(result.durationSec / 60));
  const isQuiz = result.kind === 'QUIZ';

  return (
    <div className="space-y-8">
      <Card className="flex flex-col items-center gap-6 p-8 text-center sm:flex-row sm:text-left">
        <ScoreRing value={result.score} />
        <div className="min-w-0 flex-1 space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-mute">{result.boss ? 'Boss quiz' : isQuiz ? 'Quiz' : 'Exam'} result</p>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">{result.title.replace(/^(Quiz|Exam|Boss quiz) · /, '')}</h1>
          <p className="text-lg text-mute">
            {result.correct} of {result.total} correct
            {result.almost > 0 ? ` · ${result.almost} almost` : ''}
            {result.unanswered > 0 ? ` · ${result.unanswered} not answered` : ''}
          </p>
          <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
            <span className="inline-flex items-center gap-2 rounded-full bg-xp/20 px-4 py-1.5 text-base font-bold text-[#8a6500]">
              <Star className="size-4" fill="currentColor" /> +<CountUp value={result.xpEarned} /> XP
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-subtle px-4 py-1.5 text-base font-semibold text-mute">
              <Clock className="size-4" /> about {minutes} min
            </span>
          </div>
        </div>
      </Card>

      {result.boss && (
        <Card className={cn('flex items-center gap-4 p-5', result.boss.won ? 'border-good/40 bg-good-soft' : 'border-bad/40 bg-bad-soft')}>
          <span className={cn('grid size-14 shrink-0 place-items-center rounded-2xl text-white', result.boss.won ? 'bg-good' : 'bg-bad')}>
            <Swords className="size-7" />
          </span>
          <div>
            <p className="font-heading text-2xl font-extrabold tracking-tight">{result.boss.won ? 'Boss defeated!' : 'The boss held this time'}</p>
            <p className="text-base text-mute">
              {result.boss.won
                ? `You scored 80% or more: +${result.boss.bonusXp} bonus XP.`
                : 'You need 80% to beat it. Look through the review, practise, and try again.'}
            </p>
          </div>
        </Card>
      )}

      <NewAchievements badges={result.newAchievements ?? []} />

      {result.breakdown.length > 0 && (
        <section aria-labelledby="by-skill" className="space-y-3">
          <h2 id="by-skill" className="font-heading text-2xl font-extrabold tracking-tight">
            By skill
          </h2>
          <Card className="space-y-4 p-5">
            {result.breakdown.map((b) => {
              const pct = Math.round(b.score * 100);
              return (
                <div key={b.skill} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-lg font-semibold">{b.label}</span>
                    <span className="text-base text-mute">
                      {b.correct}/{b.total} · <span className="font-bold text-ink">{pct}%</span>
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${b.label} score`}>
                    <div className={cn('h-full rounded-full transition-[width] duration-700', pct >= 80 ? 'bg-good' : pct >= 50 ? 'bg-brand' : 'bg-bad')} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </Card>
        </section>
      )}

      {(result.suggestion || result.newMistakes > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {result.suggestion && (
            <Card className="flex flex-col justify-between gap-4 border-brand/30 bg-brand-soft p-5">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-brand">Next step</p>
                <p className="mt-1 font-heading text-xl font-extrabold tracking-tight">{result.suggestion.label}</p>
                <p className="mt-1 text-base text-mute">That was your weakest area this time.</p>
              </div>
              <Link href={result.suggestion.href} className={buttonClass('primary', 'md', 'self-start')}>
                Practice now <ArrowRight className="size-5" />
              </Link>
            </Card>
          )}
          {result.newMistakes > 0 && (
            <Card className="flex flex-col justify-between gap-4 p-5">
              <div className="flex items-center gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-bad-soft text-bad-edge">
                  <Flag className="size-6" />
                </span>
                <div>
                  <p className="font-heading text-3xl font-extrabold">{result.newMistakes}</p>
                  <p className="text-base text-mute">mistake{result.newMistakes === 1 ? '' : 's'} saved. They will come back in your sessions.</p>
                </div>
              </div>
              <Link href="/mistakes" className={buttonClass('secondary', 'md', 'self-start')}>
                See my mistakes
              </Link>
            </Card>
          )}
        </div>
      )}

      <section aria-labelledby="review" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="review" className="font-heading text-2xl font-extrabold tracking-tight">
            Review
          </h2>
          <div role="radiogroup" aria-label="Show" className="inline-flex gap-2 rounded-control bg-subtle p-1.5">
            {(
              [
                ['missed', `To review (${missed.length})`],
                ['all', `All (${result.review.length})`],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                role="radio"
                aria-checked={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded-xl px-4 py-2 text-base font-semibold transition-colors',
                  filter === value ? 'bg-card text-ink shadow-soft' : 'text-mute hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <Card className="grid place-items-center gap-2 border-dashed py-10 text-center">
            <Check className="size-9 text-good" strokeWidth={3} />
            <p className="font-heading text-xl font-extrabold">Everything was right</p>
          </Card>
        ) : (
          <ul className="grid gap-4 xl:grid-cols-2">
            {shown.map((q) => (
              <li key={q.position}>
                <ReviewRow q={q} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link href="/assessments" className={buttonClass('primary', 'lg')}>
          Back to quizzes and exams
        </Link>
        <Link href="/" className={buttonClass('secondary', 'lg')}>
          Home
        </Link>
      </div>
    </div>
  );
}

export function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const query = useAssessmentResult(id);

  // Not handed in yet: go and finish it.
  const notDone = query.error instanceof ApiError && query.error.status === 409;
  useEffect(() => {
    if (notDone) router.replace(`/assessments/${id}/take`);
  }, [notDone, id, router]);

  if (query.isPending || notDone) {
    return (
      <div className="grid min-h-[50vh] place-items-center" aria-busy>
        <Spark className="size-12 animate-spin text-brand [animation-duration:1.8s]" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <Card role="alert" className="border-bad/40 bg-bad-soft text-bad-edge">
        {errorMessage(query.error, 'We could not load this result.')}
      </Card>
    );
  }
  return <Result result={query.data} />;
}
