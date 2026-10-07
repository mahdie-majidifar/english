'use client';

import { ArrowRight, Check, CircleAlert, X } from 'lucide-react';
import { useMemo } from 'react';
import { ERROR_TYPES, type AttemptResult, type ErrorTypeCode } from '@coach/contracts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';

const PRAISE = ['Exactly right!', 'Nice work!', 'You got it!', 'Well done!', 'Spot on!'];

const STYLE = {
  correct: { box: 'border-good/40 bg-good-soft', icon: 'bg-good text-white', title: 'text-good-edge', button: 'good' as const },
  almost: { box: 'border-flame/40 bg-flame/10', icon: 'bg-flame text-white', title: 'text-[#b36b00]', button: 'primary' as const },
  wrong: { box: 'border-bad/40 bg-bad-soft', icon: 'bg-bad text-white', title: 'text-bad-edge', button: 'bad' as const },
};

interface FeedbackPanelProps {
  result: AttemptResult;
  isLast: boolean;
  onContinue: () => void;
}

/**
 * Answers three questions every time: Was I right? What is the right answer? Why?
 * It slides up from the bottom, in green, amber or coral.
 */
export function FeedbackPanel({ result, isLast, onContinue }: FeedbackPanelProps) {
  const style = STYLE[result.verdict];
  const praise = useMemo(() => PRAISE[Math.floor(Math.random() * PRAISE.length)]!, []);
  const Icon = result.verdict === 'correct' ? Check : result.verdict === 'almost' ? CircleAlert : X;

  const title =
    result.verdict === 'correct' ? praise : result.verdict === 'almost' ? 'Almost! Check the spelling.' : 'Not quite.';

  const showAnswer = result.correctAnswerText && result.verdict !== 'correct';
  const mistakes = result.errorCodes.filter((c) => c !== 'OTHER.OTHER' && result.verdict !== 'correct');

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('animate-[slide-up_260ms_ease-out] border-t-2 px-5 py-4 sm:px-8', style.box)}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4 sm:flex-row sm:items-center">
        <span className={cn('grid size-12 shrink-0 animate-[pop-in_320ms_ease-out] place-items-center rounded-full', style.icon)}>
          <Icon className="size-7" strokeWidth={3} />
        </span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <p className={cn('font-heading text-xl font-extrabold tracking-tight', style.title)}>{title}</p>
          {showAnswer && (
            <p className="whitespace-pre-line text-lg font-semibold">
              <span className="font-medium text-mute">Correct answer: </span>
              {result.correctAnswerText}
            </p>
          )}
          {result.explanationFa && <p className="fa text-lg text-ink">{result.explanationFa}</p>}
          {mistakes.length > 0 && (
            <p className="flex flex-wrap gap-2 pt-1">
              {mistakes.map((code) => (
                <span key={code} className="rounded-full bg-white/70 px-3 py-0.5 text-sm font-semibold text-mute">
                  {ERROR_TYPES[code as ErrorTypeCode]?.labelEn ?? code}
                </span>
              ))}
            </p>
          )}
        </div>

        <Button variant={style.button} size="lg" onClick={onContinue} className="sm:min-w-44" autoFocus>
          {isLast ? 'See results' : 'Continue'} <ArrowRight className="size-5" />
        </Button>
      </div>
    </div>
  );
}
