'use client';

import { ChevronDown, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSystemStatus } from '@/features/auth/use-auth';

const DISMISS_KEY = 'ec-ai-notice-dismissed';
const DAY = 86_400_000;

function dismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(at) && Date.now() - at < DAY;
  } catch {
    return false;
  }
}

/**
 * A reminder, not an error: the AI is optional, but several features need it.
 * It comes back every day until a key is set.
 */
export function AiNotice() {
  const { data } = useSystemStatus();
  const [hidden, setHidden] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => setHidden(dismissedRecently()), []);

  if (!data || hidden || data.ai.provider === 'openai') return null;
  const demo = data.ai.provider === 'mock';

  return (
    <div role="note" className="mb-6 rounded-card border border-flame/40 bg-flame/10 px-5 py-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-5 shrink-0 text-[#b36b00]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold text-ink">
            {demo ? 'The AI is in demo mode.' : 'The AI is not set up yet.'}
          </p>
          <p className="mt-0.5 text-sm text-mute">
            {demo
              ? 'Answers from the AI are canned samples, not real analysis. Add an OpenAI API key for the real thing.'
              : 'Reading teacher notes, AI lessons and explanations, and marking written answers need an OpenAI API key. Practice, reviews, quizzes and exams work without it.'}
          </p>
          <p className="fa mt-1 text-sm text-mute">
            برای تحلیل یادداشت معلم، ساخت درس و توضیح با هوش مصنوعی باید API key از OpenAI بخری و در فایل <bdi>.env</bdi> بگذاری.
          </p>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline"
          >
            How to set it up <ChevronDown className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {open && (
            <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-ink">
              <li>
                Create an account at <b>platform.openai.com</b> and add a few dollars of credit. A ChatGPT subscription is separate and
                does not include API access.
              </li>
              <li>Create an API key (Dashboard, API keys).</li>
              <li>
                Open the file <b>.env</b> in the project folder and set <b>OPENAI_API_KEY=</b> to your key. Remove the line{' '}
                <b>AI_PROVIDER=mock</b> if it is there.
              </li>
              <li>Restart the API. This notice then disappears.</li>
            </ol>
          )}
        </div>
        <button
          type="button"
          aria-label="Hide for today"
          title="Hide for today"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(DISMISS_KEY, String(Date.now()));
            } catch {
              /* private mode: it just comes back on the next visit */
            }
          }}
          className="grid size-8 shrink-0 place-items-center rounded-control text-mute hover:bg-white/60 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
