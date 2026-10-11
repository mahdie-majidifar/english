'use client';

import { ArrowLeft, CheckCircle2, Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { CommitResult, MaterialDto } from '@coach/contracts';
import { Button, buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Spark } from '@/components/ui/spark';
import { cn } from '@/lib/cn';
import { errorMessage } from '@/lib/errors';
import { useState } from 'react';
import { CommitSummary, DraftReview } from './draft-review';
import { StatusChip } from './status';
import { useMaterial, useReparse } from './hooks';

const STEPS = [
  { key: 'read', label: 'Reading your material' },
  { key: 'understand', label: 'Finding words, grammar and exercises' },
  { key: 'ready', label: 'Getting it ready for you to review' },
] as const;

function Working({ status }: { status: MaterialDto['status'] }) {
  const active = status === 'PARSING' ? 1 : 0;
  return (
    <Card className="grid place-items-center gap-6 py-16 text-center" aria-live="polite">
      <Spark className="size-14 animate-spin text-brand [animation-duration:2.4s]" />
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">The coach is reading your material</h2>
        <p className="mt-2 text-lg text-mute">This usually takes under a minute. You can leave this page; it keeps going.</p>
      </div>
      <ol className="space-y-3 text-left">
        {STEPS.map((step, i) => (
          <li key={step.key} className={cn('flex items-center gap-3 text-lg', i <= active ? 'font-semibold text-ink' : 'text-mute')}>
            <span
              className={cn(
                'grid size-7 place-items-center rounded-full text-sm font-bold',
                i < active ? 'bg-good text-white' : i === active ? 'bg-brand text-white' : 'bg-subtle',
              )}
            >
              {i < active ? '✓' : i + 1}
            </span>
            {step.label}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function Failed({ material }: { material: MaterialDto }) {
  const reparse = useReparse(material.id);
  return (
    <Card role="alert" className="space-y-5 border-bad/40 bg-bad-soft">
      <div>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight text-bad-ink">We could not analyse this</h2>
        <p className="mt-2 text-lg text-ink">{material.errorMessage ?? 'Something went wrong.'}</p>
        <p className="mt-2 text-base text-mute">Your original is safe. Nothing was lost.</p>
      </div>
      {reparse.isError && <p className="text-base font-medium text-bad-ink">{errorMessage(reparse.error)}</p>}
      <div className="flex flex-wrap gap-3">
        <Button loading={reparse.isPending} onClick={() => reparse.mutate()}>
          Try again
        </Button>
        <Link href="/library/new" className={buttonClass('secondary', 'md')}>
          Add items by hand instead
        </Link>
      </div>
    </Card>
  );
}

function Original({ material }: { material: MaterialDto }) {
  if (!material.originalText && !material.fileName) return null;
  return (
    <details className="group rounded-card border border-line bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 font-heading text-lg font-bold">
        <FileText className="size-5 text-mute" />
        Original material
        <span className="ml-auto text-sm font-semibold text-mute group-open:hidden">Show</span>
        <span className="ml-auto hidden text-sm font-semibold text-mute group-open:inline">Hide</span>
      </summary>
      <div className="space-y-4 border-t border-line px-5 py-4">
        {material.originalText ? (
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-base leading-relaxed">{material.originalText}</pre>
        ) : (
          <p className="text-base text-mute">This file was read as a picture, so there is no text to show.</p>
        )}
        {material.fileName && (
          <a
            href={`/api/v1/teacher-materials/${material.id}/file`}
            className="inline-flex items-center gap-2 text-base font-semibold text-brand hover:underline"
          >
            <Download className="size-4" /> Download {material.fileName}
          </a>
        )}
      </div>
    </details>
  );
}

export function MaterialPage() {
  const { materialId } = useParams<{ materialId: string }>();
  const query = useMaterial(materialId);
  // Kept here, not in the review form: saving flips the material to COMMITTED and the form unmounts.
  const [committed, setCommitted] = useState<CommitResult | null>(null);

  if (query.isPending) return <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />;
  if (query.isError) {
    return (
      <Card role="alert" className="border-bad/40 bg-bad-soft">
        <p className="text-lg font-semibold text-bad-ink">{errorMessage(query.error, 'We could not load this material.')}</p>
        <Link href="/teacher" className="mt-3 inline-block font-semibold underline">
          Back to teacher notes
        </Link>
      </Card>
    );
  }

  const m = query.data;
  const back = m.sessionId ? `/teacher/sessions/${m.sessionId}` : '/teacher';

  return (
    <div className="space-y-6">
      <Link href={back} className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> Back to the class
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">{m.title}</h1>
        <StatusChip status={m.status} />
      </header>

      {committed && <CommitSummary result={committed} sessionId={m.sessionId} />}
      {!committed && (m.status === 'UPLOADED' || m.status === 'EXTRACTING' || m.status === 'PARSING') && <Working status={m.status} />}
      {m.status === 'FAILED' && <Failed material={m} />}
      {!committed && m.status === 'AWAITING_REVIEW' && m.draft && <DraftReview material={m} onCommitted={setCommitted} />}
      {!committed && m.status === 'COMMITTED' && (
        <Card className="flex flex-wrap items-center gap-4">
          <CheckCircle2 className="size-8 text-good" />
          <div className="mr-auto">
            <p className="font-heading text-xl font-extrabold tracking-tight">Saved to your library</p>
            <p className="text-base text-mute">You already reviewed this material.</p>
          </div>
          <Link href="/library" className={buttonClass('primary', 'md')}>
            Open library
          </Link>
        </Card>
      )}
      {m.status === 'DISCARDED' && (
        <Card className="space-y-3">
          <p className="text-lg text-mute">You discarded this analysis. The original is still here.</p>
        </Card>
      )}

      <Original material={m} />
    </div>
  );
}
