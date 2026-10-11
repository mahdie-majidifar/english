'use client';

import { useEffect, useRef } from 'react';
import type { ContentOf } from '@coach/contracts';
import { SpeakButton, useCanSpeak } from '@/components/ui/speak-button';
import { cn } from '@/lib/cn';
import { speak } from '@/lib/speech';
import type { RendererProps } from './types';

type Value = { answer: string };

/** Dictation: press play, hear the word or sentence, type it. The text itself is never shown before the check. */
export function ListenAndType({ content, value, onChange, locked, result, onEnter }: RendererProps<ContentOf['listen_and_type'], Value>) {
  const canSpeak = useCanSpeak();
  const played = useRef(false);

  // Read it once when the question appears. Browsers only allow this after the learner has clicked something
  // on the page, which they have by now (Start, Continue); if it is refused the play button still works.
  useEffect(() => {
    if (!canSpeak || played.current) return;
    played.current = true;
    const t = setTimeout(() => speak(content.audioText), 350);
    return () => clearTimeout(t);
  }, [canSpeak, content.audioText]);

  const sentence = content.audioText.trim().split(/\s+/).length > 2;
  const verdict = result?.verdict;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-5 rounded-2xl bg-brand-soft px-5 py-5">
        {canSpeak ? (
          <SpeakButton text={content.audioText} label="Play the audio" withSlow size="lg" />
        ) : (
          <p role="status" className="text-base font-semibold text-bad-edge">
            This browser cannot read English aloud, so this question cannot be played. Press Skip.
          </p>
        )}
        {content.meaningFa && (
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Meaning</p>
            <p className="fa text-2xl font-semibold">{content.meaningFa}</p>
          </div>
        )}
      </div>

      <label className="block space-y-2">
        <span className="text-base font-semibold text-mute">{sentence ? 'Type the sentence you hear' : 'Type what you hear'}</span>
        <input
          aria-label="Your answer"
          value={value.answer}
          disabled={locked}
          onChange={(e) => onChange({ answer: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onEnter();
          }}
          autoFocus
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="…"
          className={cn(
            'w-full rounded-2xl border-2 bg-card px-5 py-4 font-heading text-2xl font-bold outline-none transition-colors',
            !locked && 'border-line text-ink focus:border-brand',
            locked && verdict === 'correct' && 'border-good text-good-edge',
            locked && verdict === 'almost' && 'border-flame text-[#b36b00]',
            locked && verdict === 'wrong' && 'animate-wrong border-bad text-bad-edge',
          )}
        />
      </label>
    </div>
  );
}
