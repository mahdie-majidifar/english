'use client';

import { ListChecks } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/errors';
import { useCreateAssessment } from './hooks';

/** Builds a quiz for one lesson or unit and opens it. Says why in words when there is nothing to ask yet. */
export function QuizButton({ lessonId, unitId }: { lessonId?: string; unitId?: string }) {
  const router = useRouter();
  const create = useCreateAssessment();

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={create.isPending}
        onClick={() =>
          create.mutate(
            lessonId ? { kind: 'QUIZ', preset: 'LESSON', lessonId } : { kind: 'QUIZ', preset: 'UNIT', unitId },
            { onSuccess: (a) => router.push(`/assessments/${a.id}/take`) },
          )
        }
      >
        <ListChecks className="size-4" /> Quiz
      </Button>
      {create.isError && (
        <span role="alert" className="max-w-56 text-sm font-medium text-bad-ink">
          {errorMessage(create.error)}
        </span>
      )}
    </span>
  );
}
