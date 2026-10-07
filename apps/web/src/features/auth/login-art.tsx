import type { CSSProperties, ReactNode } from 'react';
import { BrandMark } from '@/components/ui/spark';
import { SkillChip, type Mode } from '@/components/ui/skill-chip';

interface Snippet {
  mode: Mode;
  body: ReactNode;
  className: string;
  rotate: string;
  delay: string;
}

const SNIPPETS: Snippet[] = [
  {
    mode: 'vocabulary',
    body: (
      <>
        <p className="font-heading text-3xl font-extrabold tracking-tight">negotiate</p>
        <p className="fa mt-1 text-lg text-mute">مذاکره کردن</p>
      </>
    ),
    className: 'left-[8%] top-[12%] w-64',
    rotate: '-3deg',
    delay: '0s',
  },
  {
    mode: 'grammar',
    body: (
      <p className="text-lg font-semibold leading-snug">
        She said she{' '}
        <span className="border-b-2 border-brand/50 px-3 text-brand">hadn&apos;t</span> bought me a
        present.
      </p>
    ),
    className: 'right-[6%] top-[38%] w-72',
    rotate: '2deg',
    delay: '-1.6s',
  },
  {
    mode: 'collocations',
    body: <p className="text-lg font-semibold">negotiate a discount</p>,
    className: 'bottom-[10%] left-[16%] w-60',
    rotate: '-1.5deg',
    delay: '-3.1s',
  },
];

/** Abstract illustration: geometric shapes plus floating practice snippets. No mascot. */
export function LoginArt() {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#f1edff_0%,#faf8f5_55%,#e9f8f6_100%)] lg:block"
    >
      <div className="absolute -right-16 top-10 size-96 rounded-full bg-brand/10 blur-2xl" />
      <div className="absolute -bottom-24 -left-10 size-80 rounded-full bg-colloc/15 blur-2xl" />
      <div className="absolute right-[18%] top-[12%] size-40 rounded-[45%_55%_61%_39%/43%_44%_56%_57%] bg-expr/15" />

      <div className="absolute left-10 top-10 flex items-center gap-3">
        <BrandMark />
        <span className="font-heading text-xl font-extrabold tracking-tight">English Coach</span>
      </div>

      {SNIPPETS.map((s) => (
        <div
          key={s.mode}
          style={{ '--r': s.rotate, animationDelay: s.delay } as CSSProperties}
          className={`absolute animate-float rounded-card border border-line bg-card/95 p-5 shadow-lift ${s.className}`}
        >
          <SkillChip mode={s.mode} className="mb-3" />
          {s.body}
        </div>
      ))}

      <p className="absolute bottom-10 right-10 max-w-xs text-right font-heading text-3xl font-extrabold leading-tight tracking-tight">
        Practice what you
        <br />
        learned <span className="text-brand">today.</span>
      </p>
    </aside>
  );
}
