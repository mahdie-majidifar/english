'use client';

import { ArrowLeft, FileText, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { errorMessage } from '@/lib/errors';
import { isReady, MaterialInput, type MaterialDraft } from './material-input';
import { StatusChip } from './status';
import { useAddMaterial, useDeleteSession, useSession } from './hooks';

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso}T00:00:00Z`),
  );

function AddMaterial({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const add = useAddMaterial();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MaterialDraft>({ kind: 'text', text: '', category: 'CLASS_NOTES' });

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <Plus className="size-5" /> Add more material
      </Button>
    );
  }
  return (
    <Card className="space-y-5">
      <MaterialInput value={draft} onChange={setDraft} />
      {add.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {errorMessage(add.error)}
        </p>
      )}
      <div className="flex gap-3">
        <Button
          loading={add.isPending}
          disabled={!isReady(draft)}
          onClick={() => add.mutate({ sessionId, input: draft }, { onSuccess: (m) => router.push(`/teacher/materials/${m.id}`) })}
        >
          Analyse with the coach
        </Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </Card>
  );
}

export function SessionDetailPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const session = useSession(sessionId);
  const remove = useDeleteSession();
  const [confirming, setConfirming] = useState(false);

  if (session.isPending) return <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />;
  if (session.isError) {
    return (
      <Card role="alert" className="border-bad/40 bg-bad-soft">
        <p className="text-lg font-semibold text-bad-ink">{errorMessage(session.error, 'We could not load this class.')}</p>
        <Link href="/teacher" className="mt-3 inline-block font-semibold underline">
          Back to teacher notes
        </Link>
      </Card>
    );
  }

  const s = session.data;
  return (
    <div className="space-y-8">
      <Link href="/teacher" className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> Teacher notes
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold text-mute">{dateLabel(s.classDate)}</p>
          <h1 className="mt-1 font-heading text-4xl font-extrabold tracking-tight">{s.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {s.lesson && (
              <span className="rounded-full bg-subtle px-3 py-1 text-sm font-semibold text-mute">
                {s.lesson.code} · {s.lesson.title}
              </span>
            )}
            <span className="rounded-full bg-brand-soft px-3 py-1 text-sm font-semibold text-brand">
              {s.itemCount} item{s.itemCount === 1 ? '' : 's'} saved
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          {s.itemCount > 0 && (
            <Link
              href={`/library`}
              className="inline-flex h-12 items-center rounded-control border border-line bg-card px-6 font-heading font-bold hover:bg-brand-soft"
            >
              Open library
            </Link>
          )}
          <Button variant="ghost" onClick={() => setConfirming(true)} aria-label="Delete class session">
            <Trash2 className="size-5" />
          </Button>
        </div>
      </header>

      <section className="space-y-4">
        <h2 className="font-heading text-2xl font-extrabold tracking-tight">Material</h2>
        {s.materials.length === 0 && <p className="text-lg text-mute">Nothing added to this class yet.</p>}
        <ul className="space-y-3">
          {s.materials.map((m) => (
            <li key={m.id}>
              <Link href={`/teacher/materials/${m.id}`} className="block focus-visible:outline-offset-4">
                <Card interactive className="flex flex-wrap items-center gap-4 p-5">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-grammar/10 text-grammar">
                    <FileText className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-lg font-semibold">{m.title}</p>
                    <p className="text-sm text-mute">{m.fileName ?? 'Pasted text'}</p>
                  </div>
                  <StatusChip status={m.status} />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
        <AddMaterial sessionId={s.id} />
      </section>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate(s.id, { onSuccess: () => router.replace('/teacher') })}
        loading={remove.isPending}
        error={remove.isError ? errorMessage(remove.error) : undefined}
        title={`Delete “${s.title}”?`}
        description="The class, its materials and uploaded files are deleted. Words and grammar you already saved stay in your library."
        confirmLabel="Delete class"
      />
    </div>
  );
}
