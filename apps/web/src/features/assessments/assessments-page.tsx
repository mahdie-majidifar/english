'use client';

import { ArrowRight, Clock, GraduationCap, ListChecks, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  KIND_PRESETS,
  PRESET_LABELS,
  type AssessmentKind,
  type AssessmentPreset,
  type AssessmentSummaryDto,
} from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { useAssessments, useCreateAssessment } from './hooks';

const KINDS: Record<AssessmentKind, { title: string; icon: typeof ListChecks; tone: string; body: string }> = {
  QUIZ: {
    title: 'Quiz',
    icon: ListChecks,
    tone: 'bg-brand-soft text-brand',
    body: 'A quick check. You see right away whether each answer was right. About 10 minutes.',
  },
  EXAM: {
    title: 'Exam',
    icon: GraduationCap,
    tone: 'bg-grammar/10 text-grammar',
    body: 'A proper test. No feedback until the end, with a full review afterwards.',
  },
};

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));

function HistoryRow({ a }: { a: AssessmentSummaryDto }) {
  const graded = a.status === 'GRADED';
  const pct = a.score == null ? null : Math.round(a.score * 100);
  return (
    <Link href={graded ? `/assessments/${a.id}` : `/assessments/${a.id}/take`} className="block focus-visible:outline-offset-4">
      <Card interactive className="flex items-center gap-4 p-4">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', KINDS[a.kind].tone)}>
          {a.kind === 'QUIZ' ? <ListChecks className="size-5" /> : <GraduationCap className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-heading text-lg font-bold">{a.title}</p>
          <p className="text-sm text-mute">
            {when(a.createdAt)} · {a.questionCount} questions
          </p>
        </div>
        {graded && pct != null ? (
          <span
            className={cn(
              'rounded-full px-3 py-1 font-heading text-base font-extrabold',
              pct >= 80 ? 'bg-good-soft text-good-edge' : pct >= 50 ? 'bg-brand-soft text-brand' : 'bg-bad-soft text-bad-edge',
            )}
          >
            {pct}%
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-flame/15 px-3 py-1 text-sm font-bold text-[#b36b00]">
            <Clock className="size-4" /> {a.status === 'READY' ? 'Not started' : 'Continue'}
          </span>
        )}
      </Card>
    </Link>
  );
}

export function AssessmentsPage() {
  const router = useRouter();
  const list = useAssessments();
  const create = useCreateAssessment();

  const make = (kind: AssessmentKind, preset: AssessmentPreset) =>
    create.mutate({ kind, preset }, { onSuccess: (a) => router.push(`/assessments/${a.id}/take`) });
  const creating = (kind: AssessmentKind, preset: AssessmentPreset) =>
    create.isPending && create.variables?.kind === kind && create.variables.preset === preset;

  const recs = list.data?.recommendations;
  const suggested = [
    recs?.quiz ? { kind: 'QUIZ' as const, ...recs.quiz } : null,
    recs?.exam ? { kind: 'EXAM' as const, ...recs.exam } : null,
  ].filter((r) => r !== null);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">Quizzes & Exams</h1>
        <p className="mt-2 text-lg text-mute">Test what you know. Your answers also update your reviews and mistakes.</p>
      </header>

      {create.isError && (
        <Card role="alert" className="border-bad/40 bg-bad-soft text-bad-edge">
          {errorMessage(create.error, 'We could not build that.')}
        </Card>
      )}

      {suggested.length > 0 && (
        <section aria-label="Suggested" className="grid gap-4 sm:grid-cols-2">
          {suggested.map((r) => (
            <Card key={r.kind} className="flex flex-col justify-between gap-4 border-0 bg-brand p-6 text-white shadow-lift">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-white/80">
                  <Sparkles className="size-4" /> Suggested {r.kind === 'QUIZ' ? 'quiz' : 'exam'}
                </p>
                <p className="mt-2 text-lg font-semibold">{r.reason}</p>
              </div>
              <Button
                variant="secondary"
                size="md"
                className="self-start border-0 bg-white text-brand shadow-[0_3px_0_rgba(0,0,0,0.18)]"
                onClick={() => make(r.kind, r.preset)}
                loading={creating(r.kind, r.preset)}
                disabled={create.isPending}
              >
                Start {r.kind === 'QUIZ' ? 'quiz' : 'exam'} <ArrowRight className="size-5" />
              </Button>
            </Card>
          ))}
        </section>
      )}

      <section aria-label="Build one" className="grid gap-4 lg:grid-cols-2">
        {(Object.keys(KINDS) as AssessmentKind[]).map((kind) => {
          const meta = KINDS[kind];
          return (
            <Card key={kind} className="space-y-5 p-6">
              <div className="flex items-center gap-4">
                <span className={cn('grid size-14 shrink-0 place-items-center rounded-2xl', meta.tone)}>
                  <meta.icon className="size-7" />
                </span>
                <div>
                  <h2 className="font-heading text-2xl font-extrabold tracking-tight">{meta.title}</h2>
                  <p className="text-base text-mute">{meta.body}</p>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-mute">What to cover</p>
                <div className="flex flex-wrap gap-2">
                  {KIND_PRESETS[kind].map((preset) => (
                    <Button
                      key={preset}
                      variant="secondary"
                      size="md"
                      onClick={() => make(kind, preset)}
                      loading={creating(kind, preset)}
                      disabled={create.isPending}
                    >
                      {PRESET_LABELS[preset]}
                    </Button>
                  ))}
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <section aria-labelledby="history" className="space-y-3">
        <h2 id="history" className="font-heading text-2xl font-extrabold tracking-tight">
          Your quizzes and exams
        </h2>
        {list.isPending ? (
          <div className="h-32 animate-pulse rounded-card bg-subtle" aria-busy />
        ) : list.isError ? (
          <Card role="alert" className="border-bad/40 bg-bad-soft text-bad-edge">
            {errorMessage(list.error)}
          </Card>
        ) : list.data.assessments.length === 0 ? (
          <Card className="border-dashed py-10 text-center text-lg text-mute">Nothing yet. Build your first quiz above.</Card>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {list.data.assessments.map((a) => (
              <li key={a.id}>
                <HistoryRow a={a} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
