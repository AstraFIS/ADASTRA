import { useState, type KeyboardEvent, type PointerEvent } from 'react';
import { useElementSize } from '@/hooks/useElementSize';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  /** null = no point that day; the line breaks there. */
  values: (number | null)[];
  /** Colour of the printed value label for a point; defaults to the series colour. */
  labelColor?: (value: number) => string;
  /** Where the value label sits relative to the point. */
  labelSide?: 'above' | 'below';
  /** Indexes drawn as a hollow ring on the zero line (e.g. spent, but nothing to measure). */
  hollowAt?: number[];
  hollowColor?: string;
  /** Tooltip text for a hollow index. */
  hollowText?: string;
  /** Fill a soft gradient between the line and zero. */
  area?: boolean;
  /** Tooltip text for a null value. */
  emptyText?: string;
}

interface Props {
  /** Category label under each x position (e.g. "01/09"). */
  labels: string[];
  /** Longer label used in the tooltip (e.g. "Sep 1, 2026"). Defaults to labels. */
  tooltipLabels?: string[];
  series: LineSeries[];
  formatValue: (value: number) => string;
  formatTick?: (value: number) => string;
  /** Extra rows in the tooltip that are not drawn as lines. */
  tooltipExtras?: { label: string; values: number[]; format?: (value: number) => string }[];
  height?: number;
  intervals?: number;
  headroom?: number;
  /** Top of the y-axis when no series has a positive value (keeps the scale readable). */
  fallbackMax?: number;
  /** Minimum px between points before value labels are thinned out. */
  labelMinSpacing?: number;
  ariaLabel: string;
  className?: string;
}

const MARGIN = { top: 30, right: 28, bottom: 50 }; // bottom leaves room for a 'below' label on a baseline point
const INNER_PAD = 28;
const TICK_CHAR_WIDTH = 7.2;
const MIN_SPACING_FOR_LABELS = 44;
const MIN_SPACING_FOR_AXIS = 40;
const POINT_R = 4;

interface Hover {
  index: number;
}

export default function LineChart({
  labels,
  tooltipLabels = labels,
  series,
  formatValue,
  formatTick = formatValue,
  tooltipExtras = [],
  height = 320,
  intervals = 3,
  headroom = 1.15,
  fallbackMax = 1,
  labelMinSpacing = MIN_SPACING_FOR_LABELS,
  ariaLabel,
  className = '',
}: Props) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);
  const width = size.width;

  const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const rawMax = all.length ? Math.max(0, ...all) : 0;
  const rawMin = all.length ? Math.min(0, ...all) : 0;
  const yMax = rawMax > 0 ? rawMax * headroom : rawMin < 0 ? 0 : fallbackMax;
  const yMin = rawMin < 0 ? rawMin * headroom : 0;
  const span = yMax - yMin || 1;

  const ticks = Array.from({ length: intervals + 1 }, (_, i) => yMin + (span / intervals) * i);
  const tickLabels = ticks.map(formatTick);
  const marginLeft = Math.max(...tickLabels.map((t) => t.length), 2) * TICK_CHAR_WIDTH + 20;

  const plotW = Math.max(width - marginLeft - MARGIN.right, 0);
  const plotH = Math.max(height - MARGIN.top - MARGIN.bottom, 0);
  const yFor = (v: number) => MARGIN.top + plotH - ((v - yMin) / span) * plotH;

  const n = labels.length;
  const innerW = Math.max(plotW - INNER_PAD * 2, 0);
  const spacing = n > 1 ? innerW / (n - 1) : 0;
  const xFor = (i: number) => marginLeft + INNER_PAD + (n > 1 ? i * spacing : innerW / 2);

  const axisEvery = spacing > 0 && spacing < MIN_SPACING_FOR_AXIS ? Math.ceil(MIN_SPACING_FOR_AXIS / spacing) : 1;
  // when points are too close for every value label, label every k-th point (on the same days the axis
  // shows a date) instead of hiding them all; the hovered point is always labelled
  const labelEvery =
    spacing > 0 && spacing < labelMinSpacing
      ? Math.ceil(Math.ceil(labelMinSpacing / spacing) / axisEvery) * axisEvery
      : axisEvery;
  const showPointLabel = (i: number) => i % labelEvery === 0 || hover?.index === i;

  function nearestIndex(clientX: number): number | null {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return null;
    const x = clientX - rect.left;
    if (n === 1) return 0;
    const idx = Math.round((x - marginLeft - INNER_PAD) / spacing);
    return Math.min(Math.max(idx, 0), n - 1);
  }

  function onPointerMove(e: PointerEvent<SVGRectElement>) {
    const idx = nearestIndex(e.clientX);
    if (idx !== null) setHover({ index: idx });
  }

  function onKeyDown(e: KeyboardEvent<SVGRectElement>) {
    if (n === 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const current = hover?.index ?? (e.key === 'ArrowRight' ? -1 : n);
      const next = e.key === 'ArrowRight' ? Math.min(current + 1, n - 1) : Math.max(current - 1, 0);
      setHover({ index: next });
    }
  }

  function tooltipValue(s: LineSeries, index: number): string {
    const v = s.values[index];
    if (v === null || v === undefined) {
      if (s.hollowAt?.includes(index)) return s.hollowText ?? '—';
      return s.emptyText ?? '—';
    }
    return formatValue(v);
  }

  const hx = hover ? xFor(hover.index) : 0;
  const tooltipLeft = hover ? Math.min(Math.max(hx, 100), Math.max(width - 100, 100)) : 0;
  const ready = width > 0 && n > 0;

  return (
    <div ref={wrapRef} className={`relative ${className}`} style={{ height }}>
      {ready && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel}
          className="absolute inset-0 overflow-visible"
        >
          {ticks.map((t, i) => (
            <g key={i}>
              <line
                x1={marginLeft}
                x2={marginLeft + plotW}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke="var(--color-grid)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={marginLeft - 12}
                y={yFor(t)}
                dy="0.35em"
                textAnchor="end"
                fontSize={12}
                fill="var(--color-ink-3)"
              >
                {tickLabels[i]}
              </text>
            </g>
          ))}

          {yMin < 0 && (
            <line
              x1={marginLeft}
              x2={marginLeft + plotW}
              y1={yFor(0)}
              y2={yFor(0)}
              stroke="var(--color-ink-3)"
              strokeWidth={1}
              strokeDasharray="4 4"
              opacity={0.8}
            />
          )}

          {hover && (
            <line
              x1={hx}
              x2={hx}
              y1={MARGIN.top - 8}
              y2={MARGIN.top + plotH}
              stroke="var(--color-line-strong)"
              strokeWidth={1}
            />
          )}

          {labels.map((label, i) =>
            i % axisEvery === 0 ? (
              <text
                key={String(label) + i}
                x={xFor(i)}
                y={height - 12}
                textAnchor="middle"
                fontSize={12}
                fill="var(--color-ink-2)"
              >
                {String(label)}
              </text>
            ) : null,
          )}

          {series.map((s) => {
            // a null value breaks the line into separate segments
            let path = '';
            let open = false;
            s.values.forEach((v, i) => {
              if (v === null) {
                open = false;
                return;
              }
              path += `${open ? 'L' : 'M'}${xFor(i)},${yFor(v)} `;
              open = true;
            });
            const hollow = new Set(s.hollowAt ?? []);
            // area: one closed shape per unbroken run of points, down to the zero line
            const runs: number[][] = [];
            s.values.forEach((v, i) => {
              if (v === null) return;
              if (i > 0 && s.values[i - 1] !== null && runs.length) runs[runs.length - 1].push(i);
              else runs.push([i]);
            });
            const gradId = `area-${s.key}`;
            return (
              <g key={s.key}>
                {s.area && (
                  <>
                    <defs>
                      <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    {runs.map((run) => (
                      <path
                        key={run[0]}
                        d={`M${xFor(run[0])},${yFor(0)} ${run.map((i) => `L${xFor(i)},${yFor(s.values[i] as number)}`).join(' ')} L${xFor(run[run.length - 1])},${yFor(0)} Z`}
                        fill={`url(#${gradId})`}
                      />
                    ))}
                  </>
                )}
                <path
                  d={path.trim()}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {s.values.map((v, i) => {
                  const active = hover?.index === i;
                  const side = s.labelSide ?? 'above';
                  if (v === null) {
                    return hollow.has(i) ? (
                      <circle
                        key={i}
                        cx={xFor(i)}
                        cy={yFor(0)}
                        r={active ? POINT_R + 1.5 : POINT_R}
                        fill="var(--color-surface)"
                        stroke={s.hollowColor ?? s.color}
                        strokeWidth={2}
                      />
                    ) : null;
                  }
                  return (
                    <g key={i}>
                      <circle
                        cx={xFor(i)}
                        cy={yFor(v)}
                        r={active ? POINT_R + 2 : POINT_R}
                        fill={s.color}
                        stroke="var(--color-surface)"
                        strokeWidth={2}
                      />
                      {showPointLabel(i) && (
                        <text
                          x={xFor(i)}
                          y={side === 'above' ? yFor(v) - 11 : yFor(v) + 19}
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={700}
                          fill={s.labelColor ? s.labelColor(v) : s.color}
                        >
                          {formatValue(v)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}

          <rect
            x={marginLeft}
            y={MARGIN.top - 20}
            width={plotW}
            height={plotH + 20}
            fill="transparent"
            tabIndex={0}
            aria-label="Use left and right arrow keys to inspect each day"
            className="cursor-crosshair outline-none"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
            onKeyDown={onKeyDown}
            onBlur={() => setHover(null)}
          />
        </svg>
      )}

      {hover && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 min-w-[200px] -translate-x-1/2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm shadow-lg"
          style={{ left: tooltipLeft, top: MARGIN.top - 8 }}
        >
          <p className="font-semibold text-ink">{tooltipLabels[hover.index]}</p>
          <ul className="mt-1 space-y-0.5">
            {series.map((s) => (
              <li key={s.key} className="flex items-center justify-between gap-4 text-ink-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: s.color }}
                  />
                  {s.label}
                </span>
                <span className="font-semibold tabular-nums text-ink">
                  {tooltipValue(s, hover.index)}
                </span>
              </li>
            ))}
            {tooltipExtras.map((x) => (
              <li key={x.label} className="flex items-center justify-between gap-4 text-ink-3">
                <span className="pl-[18px]">{x.label}</span>
                <span className="tabular-nums">
                  {(x.format ?? formatValue)(x.values[hover.index] ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {labels.map((label, i) => (
            <tr key={label + i}>
              <th scope="row">{tooltipLabels[i]}</th>
              {series.map((s) => (
                <td key={s.key}>{tooltipValue(s, i)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
