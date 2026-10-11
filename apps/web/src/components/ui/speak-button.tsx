'use client';

import { Turtle, Volume2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/cn';
import { speak, speechSupported, stopSpeaking } from '@/lib/speech';

/** Hides itself when the device cannot speak, so nobody is offered a button that does nothing. */
function useCanSpeak(): boolean {
  const [can, setCan] = useState(false);
  useEffect(() => setCan(speechSupported()), []);
  return can;
}

interface SpeakButtonProps {
  text: string;
  /** What a screen reader says, e.g. `Listen to “negotiate”`. */
  label?: string;
  /** Also offers a slower reading. */
  withSlow?: boolean;
  size?: 'sm' | 'lg';
  className?: string;
}

/** Plays `text` in English. Press again while it plays to stop. */
export function SpeakButton({ text, label, withSlow = false, size = 'sm', className }: SpeakButtonProps) {
  const can = useCanSpeak();
  const [playing, setPlaying] = useState<'normal' | 'slow' | null>(null);
  useEffect(() => () => stopSpeaking(), []);
  if (!can) return null;

  const play = (slow: boolean) => {
    const mode = slow ? 'slow' : 'normal';
    if (playing === mode) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    setPlaying(mode);
    speak(text, { slow, onEnd: () => setPlaying(null) });
  };

  const base =
    'inline-flex shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-offset-2';
  const dims = size === 'lg' ? 'size-16' : 'size-10';
  const icon = size === 'lg' ? 'size-8' : 'size-5';

  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <button
        type="button"
        onClick={() => play(false)}
        aria-label={label ?? `Listen to “${text}”`}
        aria-pressed={playing === 'normal'}
        className={cn(
          base,
          dims,
          playing === 'normal' ? 'border-brand bg-brand text-white' : 'border-line bg-card text-brand hover:bg-brand-soft',
        )}
      >
        <Volume2 className={icon} />
      </button>
      {withSlow && (
        <button
          type="button"
          onClick={() => play(true)}
          aria-label={`Listen slowly to “${text}”`}
          aria-pressed={playing === 'slow'}
          className={cn(
            base,
            size === 'lg' ? 'size-12' : 'size-10',
            playing === 'slow' ? 'border-brand bg-brand text-white' : 'border-line bg-card text-mute hover:bg-subtle hover:text-ink',
          )}
        >
          <Turtle className="size-5" />
        </button>
      )}
    </span>
  );
}

export { useCanSpeak };
