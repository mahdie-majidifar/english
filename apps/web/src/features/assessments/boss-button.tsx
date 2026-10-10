'use client';

import { Swords } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { errorMessage } from '@/lib/errors';
import { useCreateAssessment } from './hooks';

/** Starts the boss quiz of a unit: an exam of the whole unit, with a bonus for beating it. */
export function BossButton({ unitId }: { unitId: string }) {
  const router = useRouter();
  const create = useCreateAssessment();

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        size="sm"
        loading={create.isPending}
        onClick={() => create.mutate({ kind: 'EXAM', preset: 'BOSS', unitId }, { onSuccess: (a) => router.push(`/assessments/${a.id}/take`) })}
      >
        <Swords className="size-4" /> Boss quiz
      </Button>
      {create.isError && (
        <span role="alert" className="max-w-56 text-sm font-medium text-bad-edge">
          {errorMessage(create.error)}
        </span>
      )}
    </span>
  );
}
