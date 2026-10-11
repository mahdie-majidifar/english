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
    <div role="note" className="mb-5 rounded-control border border-flame/40 bg-flame/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-ink" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink">
            <b>{demo ? 'The AI is in demo mode.' : 'The AI is not set up yet.'}</b>{' '}
            <span className="text-mute">
              {demo
                ? 'Its answers are canned samples. Add an OpenAI API key for the real thing.'
                : 'Teacher-note reading, AI lessons and explanations need an OpenAI API key. Everything else works without it.'}
            </span>{' '}
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex items-center gap-1 font-semibold text-brand hover:underline"
            >
              How to set it up <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
          </p>
          {open && (
            <div className="mt-3 space-y-2">
              <p className="fa text-sm text-mute">
                برای تحلیل یادداشت معلم، ساخت درس و توضیح با هوش مصنوعی باید API key از OpenAI بخری و در فایل <bdi>.env</bdi> بگذاری.
              </p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-ink">
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
            </div>
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
          className="grid size-7 shrink-0 place-items-center rounded-control text-mute hover:bg-card/60 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
