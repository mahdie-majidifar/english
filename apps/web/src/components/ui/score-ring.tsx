/** A ring that fills to a 0..1 score, with the percentage in the middle. Green from 80%. */
export function ScoreRing({ value, size = 'size-36' }: { value: number; size?: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = Math.round(value * 100);
  return (
    <div className={`relative ${size}`} role="img" aria-label={`${pct} percent`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--subtle)" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={pct >= 80 ? 'var(--good)' : 'var(--brand)'}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value)}
          style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center font-heading text-3xl font-extrabold">{pct}%</span>
    </div>
  );
}
