import type { DayStat } from '@coach/contracts';

const fmt = (date: string) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
const fmtLong = (date: string) =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

/**
 * Minutes practised per day. Green bars are days the daily goal was met. Every bar has a text
 * description (hover or screen reader) and the whole chart has a one-line summary.
 */
export function ActivityChart({ daily }: { daily: DayStat[] }) {
  const width = 640;
  const height = 180;
  const pad = { top: 12, right: 8, bottom: 26, left: 30 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(10, ...daily.map((d) => d.minutes));
  const niceMax = Math.ceil(max / 10) * 10;
  const slot = innerW / daily.length;
  const bar = Math.max(2, Math.min(24, slot * 0.7));

  const total = daily.reduce((n, d) => n + d.minutes, 0);
  const active = daily.filter((d) => d.attempts > 0).length;
  const labelEvery = daily.length <= 8 ? 1 : daily.length <= 31 ? 5 : 15;

  return (
    <figure className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Minutes practised each day: ${total} minutes over ${active} active day${active === 1 ? '' : 's'} in the last ${daily.length} days.`}
        className="w-full"
      >
        {[0, niceMax / 2, niceMax].map((v) => {
          const y = pad.top + innerH - (v / niceMax) * innerH;
          return (
            <g key={v}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="var(--line)" strokeWidth={1} />
              <text x={pad.left - 6} y={y + 4} textAnchor="end" fontSize={11} fill="var(--mute)">
                {v}
              </text>
            </g>
          );
        })}
        {daily.map((d, i) => {
          const h = (d.minutes / niceMax) * innerH;
          const x = pad.left + i * slot + (slot - bar) / 2;
          return (
            <g key={d.date}>
              <title>{`${fmtLong(d.date)}: ${d.minutes} min, ${d.attempts} answers, ${d.xp} XP${d.goalMet ? ', goal reached' : ''}`}</title>
              {d.minutes > 0 ? (
                <rect x={x} y={pad.top + innerH - h} width={bar} height={Math.max(h, 3)} rx={Math.min(4, bar / 2)} fill={d.goalMet ? 'var(--good)' : 'var(--brand)'} />
              ) : (
                <rect x={x} y={pad.top + innerH - 2} width={bar} height={2} rx={1} fill="var(--line)" />
              )}
              {i % labelEvery === 0 || i === daily.length - 1 ? (
                <text x={x + bar / 2} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--mute)">
                  {fmt(d.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <figcaption className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-mute">
        <span className="inline-flex items-center gap-2">
          <i aria-hidden className="size-3 rounded-sm bg-brand" /> Minutes practised
        </span>
        <span className="inline-flex items-center gap-2">
          <i aria-hidden className="size-3 rounded-sm bg-good" /> Daily goal reached
        </span>
      </figcaption>
    </figure>
  );
}
