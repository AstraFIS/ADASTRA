import { useMemo, useState } from 'react';
import { formatInteger } from '@/lib/format';

export interface PieSlice {
  label: string;
  value: number;
}

interface Props {
  title: string;
  caption?: string;
  /** Second line, e.g. "First Page View · unique users". */
  subtitle: string;
  slices: PieSlice[];
  emptyText?: string;
}

const COLORS: Record<string, string> = {
  pc: 'var(--color-azure)',
  desktop: 'var(--color-azure)',
  mobile: 'var(--color-spend)',
  smartphone: 'var(--color-spend)',
  tablet: 'var(--color-violet)',
  unknown: 'var(--color-line-strong)',
};
const FALLBACK = ['var(--color-revenue)', 'var(--color-loss)', 'var(--color-ink-3)'];

const SIZE = 180;
const R = 80; // outer radius
const INNER = 50; // donut hole
const C = SIZE / 2;

/** Annular sector from angle a0 to a1 (radians, 0 = 12 o'clock, clockwise). */
function arc(a0: number, a1: number): string {
  const p = (r: number, a: number) => `${C + r * Math.sin(a)},${C - r * Math.cos(a)}`;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${p(R, a0)} A${R},${R} 0 ${large} 1 ${p(R, a1)} L${p(INNER, a1)} A${INNER},${INNER} 0 ${large} 0 ${p(INNER, a0)} Z`;
}

/** Donut chart of users per device: total in the middle, legend with count and share. */
export default function DevicePieCard({ title, caption, subtitle, slices, emptyText = 'No users for this selection.' }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  // biggest first, "Unknown" always last; zero slices left out
  const data = useMemo(
    () =>
      slices
        .filter((s) => s.value > 0)
        .sort((a, b) => Number(a.label === 'Unknown') - Number(b.label === 'Unknown') || b.value - a.value)
        .map((s, i) => ({ ...s, color: COLORS[s.label.toLowerCase()] ?? FALLBACK[i % FALLBACK.length]! })),
    [slices],
  );
  const total = data.reduce((n, s) => n + s.value, 0);
  const pct = (v: number) => (total ? `${Math.round((v / total) * 100)}%` : '0%');

  let angle = 0;
  const paths = data.map((s) => {
    const a0 = angle;
    angle += (s.value / total) * Math.PI * 2;
    return { ...s, a0, a1: angle };
  });
  const focus = hover ? data.find((d) => d.label === hover) : null;

  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-sm font-bold text-ink">{title}</h2>
        {caption && <p className="text-xs text-ink-2">{caption}</p>}
      </div>
      <p className="mt-0.5 text-xs text-ink-3">
        {subtitle}
        {total > 0 && <> · total {formatInteger(total)}</>}
      </p>

      {total === 0 ? (
        <div className="flex h-[236px] items-center justify-center text-center text-sm text-ink-3">{emptyText}</div>
      ) : (
        <div className="mt-2 flex h-[236px] items-center justify-center gap-6">
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value} (${pct(d.value)})`).join(', ')}`}
            className="shrink-0"
          >
            {paths.length === 1 ? (
              // a single slice is a full ring (an arc from 0 to 2π would collapse)
              <>
                <circle cx={C} cy={C} r={(R + INNER) / 2} fill="none" stroke={paths[0]!.color} strokeWidth={R - INNER} />
              </>
            ) : (
              paths.map((s) => (
                <path
                  key={s.label}
                  d={arc(s.a0, s.a1)}
                  fill={s.color}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  opacity={hover && hover !== s.label ? 0.35 : 1}
                  onPointerEnter={() => setHover(s.label)}
                  onPointerLeave={() => setHover(null)}
                  style={{ transition: 'opacity 120ms' }}
                >
                  <title>{`${s.label}: ${formatInteger(s.value)} users (${pct(s.value)})`}</title>
                </path>
              ))
            )}
            <text x={C} y={C - 4} textAnchor="middle" fontSize={22} fontWeight={800} fill="var(--color-ink)">
              {formatInteger(focus ? focus.value : total)}
            </text>
            <text x={C} y={C + 15} textAnchor="middle" fontSize={11} fill="var(--color-ink-3)">
              {focus ? `${focus.label} · ${pct(focus.value)}` : 'users'}
            </text>
          </svg>

          <ul className="min-w-0 space-y-2 text-sm">
            {data.map((s) => (
              <li
                key={s.label}
                className={`flex items-center gap-2 transition-opacity ${hover && hover !== s.label ? 'opacity-40' : ''}`}
                onPointerEnter={() => setHover(s.label)}
                onPointerLeave={() => setHover(null)}
              >
                <span aria-hidden="true" className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} />
                <span className="truncate text-ink-2">{s.label}</span>
                <span className="ml-auto pl-3 font-bold tabular-nums text-ink">{formatInteger(s.value)}</span>
                <span className="w-10 text-right text-xs tabular-nums text-ink-3">{pct(s.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
