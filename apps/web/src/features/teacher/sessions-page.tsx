'use client';

import { NotebookPen, Plus } from 'lucide-react';
import Link from 'next/link';
import type { TeacherSessionSummary } from '@coach/contracts';
import { buttonClass, Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusChip } from './status';
import { useSessions } from './hooks';

const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

function SessionCard({ session }: { session: TeacherSessionSummary }) {
  return (
    <Link href={`/teacher/sessions/${session.id}`} className="block focus-visible:outline-offset-4">
      <Card interactive className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-mute">{dateLabel(session.classDate)}</p>
          <h2 className="truncate font-heading text-xl font-extrabold tracking-tight">{session.title}</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mute">
            {session.lesson && (
              <span className="rounded-full bg-subtle px-3 py-1 font-semibold">
                {session.lesson.code} · {session.lesson.title}
              </span>
            )}
            <span>
              {session.materialCount} material{session.materialCount === 1 ? '' : 's'}
            </span>
            <span aria-hidden>·</span>
            <span>
              {session.itemCount} item{session.itemCount === 1 ? '' : 's'} saved
            </span>
          </div>
        </div>
        {session.latestStatus && <StatusChip status={session.latestStatus} />}
      </Card>
    </Link>
  );
}

export function SessionsPage() {
  const sessions = useSessions();

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight">Teacher notes</h1>
          <p className="mt-2 text-lg text-mute">Add what your teacher covered. The coach turns it into practice.</p>
        </div>
        <Link href="/teacher/new" className={buttonClass('primary', 'md')}>
          <Plus className="size-5" /> New class session
        </Link>
      </header>

      {sessions.isPending && (
        <div className="space-y-4" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-card bg-subtle" />
          ))}
        </div>
      )}

      {sessions.isError && (
        <Card role="alert" className="border-bad/40 bg-bad-soft">
          <p className="text-lg font-semibold text-bad-edge">We could not load your class sessions.</p>
          <Button variant="secondary" className="mt-4" onClick={() => sessions.refetch()}>
            Try again
          </Button>
        </Card>
      )}

      {sessions.data?.length === 0 && (
        <Card className="grid place-items-center gap-4 border-dashed py-16 text-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-grammar/10 text-grammar">
            <NotebookPen className="size-8" />
          </span>
          <h2 className="font-heading text-2xl font-extrabold tracking-tight">Add your first class</h2>
          <p className="max-w-md text-lg text-mute">
            Paste your notes or upload a photo of the board. You review everything before it is saved.
          </p>
          <Link href="/teacher/new" className={buttonClass('primary', 'lg')}>
            <Plus className="size-5" /> New class session
          </Link>
        </Card>
      )}

      {sessions.data && sessions.data.length > 0 && (
        <div className="space-y-4">
          {sessions.data.map((s) => (
            <SessionCard key={s.id} session={s} />
          ))}
        </div>
      )}
    </div>
  );
}
