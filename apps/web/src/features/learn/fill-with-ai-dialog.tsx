'use client';

import { Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { FormEvent } from 'react';
import { SUGGEST_FOCUS, type SuggestFocus } from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, SelectField } from '@/components/ui/field';
import { errorMessage } from '@/lib/errors';
import { useSuggestLessonContent } from './hooks';

const FOCUS_LABEL: Record<SuggestFocus, string> = {
  MIXED: 'A mix of everything',
  VOCABULARY: 'Mostly words',
  GRAMMAR: 'Mostly grammar',
  COLLOCATION: 'Mostly collocations',
};

interface Props {
  open: boolean;
  onClose: () => void;
  lessonId: string;
  lessonName: string;
  /** The lesson only has a neutral name, so the AI cannot guess the topic. */
  needsTopic: boolean;
}

/**
 * Asks the AI for starter content for one lesson. What comes back is a draft to review, like teacher
 * notes: nothing reaches the library until the learner confirms it.
 */
export function FillWithAiDialog({ open, onClose, lessonId, lessonName, needsTopic }: Props) {
  const router = useRouter();
  const suggest = useSuggestLessonContent(lessonId);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const topic = String(form.get('topic') ?? '').trim();
    suggest.mutate(
      { focus: String(form.get('focus')) as SuggestFocus, ...(topic ? { topic } : {}) },
      { onSuccess: (result) => router.push(`/teacher/materials/${result.materialId}`) },
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Fill this lesson with AI"
      description={`The AI suggests words and grammar for ${lessonName}. You look through them and keep what you want.`}
    >
      <form onSubmit={onSubmit} className="space-y-5">
        <Field
          label={needsTopic ? 'What is this lesson about?' : 'Topic (optional)'}
          name="topic"
          placeholder="Business meetings"
          required={needsTopic}
          autoFocus
          hint={needsTopic ? 'This lesson has no name yet, so tell the AI the topic.' : 'Leave empty to use the lesson name.'}
        />
        <SelectField label="What to focus on" name="focus" defaultValue="MIXED">
          {SUGGEST_FOCUS.map((f) => (
            <option key={f} value={f}>
              {FOCUS_LABEL[f]}
            </option>
          ))}
        </SelectField>
        <p className="fa text-sm text-mute">هوش مصنوعی پیشنهاد می‌دهد؛ چیزی خودکار ذخیره نمی‌شود. خودت بررسی و انتخاب می‌کنی.</p>
        {suggest.isError && (
          <p role="alert" className="rounded-control bg-bad-soft px-4 py-3 text-base font-medium text-bad-ink">
            {errorMessage(suggest.error)}
          </p>
        )}
        <Button type="submit" size="lg" loading={suggest.isPending} className="w-full">
          <Sparkles className="size-5" /> Suggest content
        </Button>
      </form>
    </Dialog>
  );
}
