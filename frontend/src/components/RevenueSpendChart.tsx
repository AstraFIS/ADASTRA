import { useState, type FocusEvent, type PointerEvent } from 'react';
import { useElementWidth } from '@/hooks/useElementWidth';
import { formatCurrency, joinNames } from '@/lib/format';
import type { PlatformSummary } from '@/types/platforms';

interface Props {
  platforms: PlatformSummary[];
}

type SeriesKey = 'revenue' | 'spend';

const SERIES: { key: SeriesKey; label: string; color: string }[] = [
  { key: 'revenue', label: 'Revenue', color: 'var(--color-revenue)' },
  { key: 'spend', label: 'Spend', color: 'var(--color-spend)' },
];

const HEIGHT = 380;
const MARGIN = { top: 16, right: 16, bottom: 48, left: 76 };
const INTERVALS = 3;
const BAR_GAP = 2;
const BAR_MAX_WIDTH = 220;
const RADIUS = 4;

interface Hover {
  index: number;
  x: number;
  y: number;
}

/** Rect with rounded top corners and a square base, anchored at the baseline. */
function columnPath(x: number, top: number, width: number, height: number): string {
  const r = Math.min(RADIUS, width / 2, height);
  const bottom = top + height;
  return [
    `M${x},${bottom}`,
    `V${top + r}`,
    `Q${x},${top} ${x + r},${top}`,
    `H${x + width - r}`,
    `Q${x + width},${top} ${x + width},${top + r}`,
    `V${bottom}`,
    'Z',
  ].join(' ');
}

export default function RevenueSpendChart({ platforms }: Props) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);

  const plotW = Math.max(width - MARGIN.left - MARGIN.right, 0);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const baseline = MARGIN.top + plotH;

  const values = platforms.flatMap((p) => (p.metrics ? [p.metrics.revenue, p.metrics.spend] : []));
  const maxValue = values.length ? Math.max(...values) : 0;
  const yMax = maxValue > 0 ? maxValue * 1.2 : 1;
  const yFor = (v: number) => baseline - (v / yMax) * plotH;
  const ticks = Array.from({ length: INTERVALS + 1 }, (_, i) => (yMax / INTERVALS) * i);

  const groupW = platforms.length ? plotW / platforms.length : 0;
  const barW = Math.min(groupW * 0.45, BAR_MAX_WIDTH);

  const notConnected = platforms.filter((p) => !p.connected).map((p) => p.name);
  const hovered = hover ? platforms[hover.index] : null;

  function showTooltip(index: number, clientX: number, clientY: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ index, x: clientX - rect.left, y: clientY - rect.top });
  }

  function onPointerMove(index: number) {
    return (e: PointerEvent<SVGRectElement>) => showTooltip(index, e.clientX, e.clientY);
  }

  function onFocus(index: number) {
    return (e: FocusEvent<SVGRectElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const p = platforms[index];
      const top = p?.metrics ? yFor(Math.max(p.metrics.revenue, p.metrics.spend)) : MARGIN.top;
      const wrap = wrapRef.current?.getBoundingClientRect();
      if (!wrap) return;
      setHover({ index, x: rect.left + rect.width / 2 - wrap.left, y: top });
    };
  }

  const tooltipLeft = hover ? Math.min(Math.max(hover.x, 90), Math.max(width - 90, 90)) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-bold text-ink">Revenue &amp; Spend by Platform</h2>
        <ul className="flex items-center gap-5 text-sm text-ink-2" aria-label="Legend">
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-3 w-3 rounded-sm"
                style={{ background: s.color }}
              />
              {s.label}
            </li>
          ))}
        </ul>
      </div>

      <div ref={wrapRef} className="relative mt-4">
        {width > 0 && (
          <svg
            width={width}
            height={HEIGHT}
            viewBox={`0 0 ${width} ${HEIGHT}`}
            role="img"
            aria-label="Grouped bar chart of revenue and spend per platform"
            className="block overflow-visible"
          >
            {/* gridlines + y-axis ticks */}
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotW}
                  y1={yFor(t)}
                  y2={yFor(t)}
                  stroke="var(--color-grid)"
                  strokeWidth={1}
                  shapeRendering="crispEdges"
                />
                <text
                  x={MARGIN.left - 14}
                  y={yFor(t)}
                  dy="0.35em"
                  textAnchor="end"
                  fontSize={12}
                  fill="var(--color-ink-3)"
                >
                  {formatCurrency(t, { whole: true })}
                </text>
              </g>
            ))}

            {platforms.map((p, i) => {
              const gx = MARGIN.left + i * groupW;
              const cx = gx + groupW / 2;
              const isHovered = hover?.index === i;

              return (
                <g key={p.id}>
                  {/* baseline: solid under real data, dashed where no connection exists */}
                  <line
                    x1={gx + (i === 0 ? 0 : 8)}
                    x2={gx + groupW - 8}
                    y1={baseline}
                    y2={baseline}
                    stroke={p.connected ? 'var(--color-line-strong)' : 'var(--color-ink-3)'}
                    strokeWidth={p.connected ? 1 : 2}
                    strokeDasharray={p.connected ? undefined : '6 6'}
                    opacity={p.connected ? 1 : 0.6}
                  />

                  {p.metrics ? (
                    SERIES.map((s, si) => {
                      const value = p.metrics![s.key];
                      const x = si === 0 ? cx - barW - BAR_GAP / 2 : cx + BAR_GAP / 2;
                      const top = yFor(value);
                      return (
                        <path
                          key={s.key}
                          d={columnPath(x, top, barW, baseline - top)}
                          fill={s.color}
                          style={{
                            filter: isHovered ? 'brightness(1.12)' : undefined,
                            transition: 'filter 120ms',
                          }}
                        />
                      );
                    })
                  ) : (
                    <text
                      x={cx}
                      y={MARGIN.top + plotH / 2}
                      textAnchor="middle"
                      fontSize={13}
                      fill="var(--color-ink-3)"
                    >
                      🔒 No data yet
                    </text>
                  )}

                  {/* x label */}
                  <text
                    x={cx}
                    y={HEIGHT - 16}
                    textAnchor="middle"
                    fontSize={14}
                    fill="var(--color-ink-2)"
                  >
                    {p.name}
                  </text>

                  {/* hit target — the whole group column, larger than the marks */}
                  {p.metrics && (
                    <rect
                      x={gx}
                      y={MARGIN.top}
                      width={groupW}
                      height={plotH}
                      fill="transparent"
                      tabIndex={0}
                      aria-label={`${p.name}: revenue ${formatCurrency(p.metrics.revenue)}, spend ${formatCurrency(p.metrics.spend)}`}
                      className="cursor-pointer outline-none"
                      onPointerMove={onPointerMove(i)}
                      onPointerLeave={() => setHover(null)}
                      onFocus={onFocus(i)}
                      onBlur={() => setHover(null)}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        )}

        {hover && hovered?.metrics && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 min-w-[170px] -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm shadow-lg"
            style={{ left: tooltipLeft, top: hover.y - 10 }}
          >
            <p className="font-semibold text-ink">{hovered.name}</p>
            <ul className="mt-1 space-y-0.5">
              {SERIES.map((s) => (
                <li key={s.key} className="flex items-center justify-between gap-4 text-ink-2">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 rounded-sm"
                      style={{ background: s.color }}
                    />
                    {s.label}
                  </span>
                  <span className="font-semibold tabular-nums text-ink">
                    {formatCurrency(hovered.metrics![s.key])}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* table view for screen readers and no-hover contexts */}
      <table className="sr-only">
        <caption>Revenue and spend by platform</caption>
        <thead>
          <tr>
            <th scope="col">Platform</th>
            <th scope="col">Revenue</th>
            <th scope="col">Spend</th>
          </tr>
        </thead>
        <tbody>
          {platforms.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.name}</th>
              <td>{p.metrics ? formatCurrency(p.metrics.revenue) : 'No data yet'}</td>
              <td>{p.metrics ? formatCurrency(p.metrics.spend) : 'No data yet'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {notConnected.length > 0 && (
        <p className="mt-5 text-sm text-ink-3">
          {joinNames(notConnected)} bars are flat because no data connection exists yet — this
          isn&apos;t a $0 performance result, it&apos;s an absence of data.
        </p>
      )}
    </div>
  );
}
