'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { errorMessage } from '@/lib/errors';
import { useMe } from '@/features/auth/use-auth';
import { useCurrent } from '@/features/catalog/hooks';
import { LessonSelect } from '@/features/catalog/lesson-select';
import { isReady, MaterialInput, type MaterialDraft } from './material-input';
import { useAddMaterial, useCreateSession } from './hooks';

/** Today's date in the learner's own timezone, as YYYY-MM-DD. */
function todayIn(timeZone: string | undefined): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** Two steps behind one button: create the class, then add the material to it. */
function NewSessionForm({ timeZone, defaultLessonId }: { timeZone?: string; defaultLessonId: string | null }) {
  const router = useRouter();
  const createSession = useCreateSession();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const addMaterial = useAddMaterial();

  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayIn(timeZone));
  const [lessonId, setLessonId] = useState<string | null>(defaultLessonId);
  const [material, setMaterial] = useState<MaterialDraft>({ kind: 'text', text: '', category: 'CLASS_NOTES' });
  const [errors, setErrors] = useState<{ title?: string; material?: string }>({});

  const pending = createSession.isPending || addMaterial.isPending;
  const failure = createSession.error ?? addMaterial.error;
  const failureMessage = failure ? errorMessage(failure) : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!title.trim()) next.title = 'Give this class a name, like “Session 21”.';
    if (!isReady(material)) next.material = material.kind === 'text' ? 'Paste your notes first.' : 'Choose a file first.';
    setErrors(next);
    if (Object.keys(next).length) return;

    // If adding the material fails, the class already exists: retrying must not create a second one.
    let id = sessionId;
    if (!id) {
      const session = await createSession
        .mutateAsync({ title: title.trim(), classDate: date, lessonId })
        .catch(() => null);
      if (!session) return;
      id = session.id;
      setSessionId(id);
    }

    addMaterial.mutate(
      { sessionId: id, input: material },
      { onSuccess: (created) => router.push(`/teacher/materials/${created.id}`) },
    );
  }
  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Card className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-[1fr_12rem]">
          <Field
            label="Class name"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Session 21"
            error={errors.title}
            autoFocus
          />
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <LessonSelect value={lessonId} onChange={setLessonId} label="Which lesson was it about? (optional)" />
      </Card>

      <Card>
        <MaterialInput value={material} onChange={setMaterial} error={errors.material} />
      </Card>

      {failureMessage && (
        <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
          {failureMessage}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" loading={pending} className="sm:min-w-56">
          Analyse with the coach
        </Button>
        <p className="text-base text-mute">You will review everything before it is saved.</p>
      </div>
    </form>
  );
}

export function NewSessionPage() {
  const me = useMe();
  const current = useCurrent();

  return (
    <div className="space-y-6">
      <Link href="/teacher" className="inline-flex items-center gap-2 text-base font-semibold text-mute hover:text-ink">
        <ArrowLeft className="size-4" /> Teacher notes
      </Link>
      <div>
        <h1 className="font-heading text-4xl font-extrabold tracking-tight">New class session</h1>
        <p className="mt-2 text-lg text-mute">Add what your teacher covered today.</p>
      </div>
      {me.isPending || current.isPending ? (
        <div className="h-96 animate-pulse rounded-card bg-subtle" aria-busy />
      ) : (
        <NewSessionForm timeZone={me.data?.user.timezone} defaultLessonId={current.data?.lesson.id ?? null} />
      )}
    </div>
  );
}
