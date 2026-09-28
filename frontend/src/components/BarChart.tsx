import { useState, type FocusEvent, type PointerEvent } from 'react';
import { useElementSize } from '@/hooks/useElementSize';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
  values: number[];
}

interface Props {
  categories: string[];
  series: BarSeries[];
  /** Label printed on top of each bar. */
  formatValue: (value: number) => string;
  /** Y-axis tick text. Defaults to formatValue. */
  formatTick?: (value: number) => string;
  /** Value text inside the tooltip. Defaults to formatValue. */
  formatTooltipValue?: (value: number) => string;
  /** Number of gridline intervals above the baseline. */
  intervals?: number;
  /** Multiplier applied to the largest value to leave room for its label. */
  headroom?: number;
  /** Fixed pixel height. Omit to fill the wrapper (give it a height or flex-1 via className). */
  height?: number;
  barMaxWidth?: number;
  showValueLabels?: boolean;
  ariaLabel: string;
  className?: string;
}

const MARGIN = { top: 26, right: 12 };
const LABEL_LINE_HEIGHT = 14;
const LABEL_MAX_LINES = 3;
const BAR_GAP = 6;
const RADIUS = 4;
const TICK_CHAR_WIDTH = 7.2;
const LABEL_CHAR_EM = 0.55; // average glyph width as a fraction of font size (Inter, mixed case)
const MIN_BAR_WIDTH_FOR_LABELS = 26;

interface Hover {
  index: number;
  x: number;
  y: number;
}

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

function truncate(label: string, maxChars: number): string {
  if (label.length <= maxChars) return label;
  return `${label.slice(0, Math.max(1, maxChars - 1))}…`;
}

/** Break a label into up to LABEL_MAX_LINES lines at spaces or after "/", truncating what still overflows. */
function wrapLabel(label: string, maxChars: number): string[] {
  const words = label.split(/ +|(?<=\/)/).filter(Boolean);
  const lines: string[] = [];
  for (const word of words) {
    const last = lines[lines.length - 1];
    if (last !== undefined && `${last} ${word}`.length <= maxChars) {
      lines[lines.length - 1] = `${last} ${word}`;
    } else {
      lines.push(word);
    }
  }
  if (lines.length > LABEL_MAX_LINES) {
    lines.splice(LABEL_MAX_LINES - 1, lines.length, lines.slice(LABEL_MAX_LINES - 1).join(' '));
  }
  return lines.map((l) => truncate(l, maxChars));
}

export default function BarChart({
  categories,
  series,
  formatValue,
  formatTick = formatValue,
  formatTooltipValue = formatValue,
  intervals = 4,
  headroom = 1.15,
  height,
  barMaxWidth,
  showValueLabels = true,
  ariaLabel,
  className = '',
}: Props) {
  const [wrapRef, size] = useElementSize<HTMLDivElement>();
  const [hover, setHover] = useState<Hover | null>(null);

  const width = size.width;
  const chartHeight = height ?? size.height;

  const maxValue = Math.max(0, ...series.flatMap((s) => s.values));
  const yMax = maxValue > 0 ? maxValue * headroom : 1;
  const ticks = Array.from({ length: intervals + 1 }, (_, i) => (yMax / intervals) * i);
  const tickLabels = ticks.map(formatTick);
  const marginLeft = Math.max(...tickLabels.map((t) => t.length)) * TICK_CHAR_WIDTH + 20;

  const plotW = Math.max(width - marginLeft - MARGIN.right, 0);
  const n = categories.length;
  const groupW = n > 0 ? plotW / n : 0;

  // x labels: smaller font in narrow groups, wrapped onto several lines when they don't fit
  const labelFont = groupW < 70 ? 11 : 12;
  const labelEvery = groupW > 0 && groupW < 36 ? Math.ceil(36 / groupW) : 1;
  const maxLabelChars = Math.max(3, Math.floor((groupW * labelEvery - 6) / (labelFont * LABEL_CHAR_EM)));
  const wrapped = categories.map((c) => wrapLabel(c, maxLabelChars));
  const labelLines = Math.max(1, ...wrapped.map((w) => w.length));
  const marginBottom = 24 + labelLines * LABEL_LINE_HEIGHT;

  const plotH = Math.max(chartHeight - MARGIN.top - marginBottom, 0);
  const baseline = MARGIN.top + plotH;
  const yFor = (v: number) => baseline - (v / yMax) * plotH;

  const s = series.length;
  const barW =
    s === 1
      ? Math.min(groupW * 0.72, barMaxWidth ?? 160)
      : Math.min((groupW * 0.88 - BAR_GAP * (s - 1)) / s, barMaxWidth ?? 60);
  const clusterW = barW * s + BAR_GAP * (s - 1);
  // Labels on very thin bars collide with their neighbours; the tooltip still carries the value.
  const labelsVisible = showValueLabels && barW >= MIN_BAR_WIDTH_FOR_LABELS;

  function showTooltip(index: number, clientX: number, clientY: number) {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ index, x: clientX - rect.left, y: clientY - rect.top });
  }

  const onPointerMove = (index: number) => (e: PointerEvent<SVGRectElement>) =>
    showTooltip(index, e.clientX, e.clientY);

  const onFocus = (index: number) => (e: FocusEvent<SVGRectElement>) => {
    const wrap = wrapRef.current?.getBoundingClientRect();
    const rect = e.currentTarget.getBoundingClientRect();
    if (!wrap) return;
    const top = yFor(Math.max(0, ...series.map((sr) => sr.values[index] ?? 0)));
    setHover({ index, x: rect.left + rect.width / 2 - wrap.left, y: top });
  };

  const tooltipLeft = hover ? Math.min(Math.max(hover.x, 90), Math.max(width - 90, 90)) : 0;
  const ready = width > 0 && chartHeight > 0;

  return (
    <div
      ref={wrapRef}
      className={`relative ${className}`}
      style={height ? { height } : undefined}
    >
      {ready && (
        <svg
          width={width}
          height={chartHeight}
          viewBox={`0 0 ${width} ${chartHeight}`}
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
                stroke={i === 0 ? 'var(--color-line-strong)' : 'var(--color-grid)'}
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

          {categories.map((category, i) => {
            const gx = marginLeft + i * groupW;
            const cx = gx + groupW / 2;
            const clusterX = cx - clusterW / 2;
            const isHovered = hover?.index === i;

            return (
              <g key={category}>
                {series.map((sr, si) => {
                  const value = sr.values[i] ?? 0;
                  const x = clusterX + si * (barW + BAR_GAP);
                  const top = yFor(value);
                  const showLabel = labelsVisible && (value > 0 || s === 1);
                  return (
                    <g key={sr.key}>
                      {value > 0 && (
                        <path
                          d={columnPath(x, top, barW, baseline - top)}
                          fill={sr.color}
                          style={{
                            filter: isHovered ? 'brightness(1.12)' : undefined,
                            transition: 'filter 120ms',
                          }}
                        />
                      )}
                      {showLabel && (
                        <text
                          x={x + barW / 2}
                          y={top - 7}
                          textAnchor="middle"
                          fontSize={12}
                          fontWeight={700}
                          fill="var(--color-ink)"
                        >
                          {formatValue(value)}
                        </text>
                      )}
                    </g>
                  );
                })}

                {i % labelEvery === 0 && (
                  <text
                    x={cx}
                    y={baseline + 22}
                    textAnchor="middle"
                    fontSize={labelFont}
                    fill="var(--color-ink-2)"
                  >
                    <title>{category}</title>
                    {(wrapped[i] ?? [category]).map((line, li) => (
                      <tspan key={li} x={cx} dy={li === 0 ? 0 : LABEL_LINE_HEIGHT}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                )}

                <rect
                  x={gx}
                  y={MARGIN.top - 20}
                  width={groupW}
                  height={plotH + 20}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${category}: ${series
                    .map((sr) => `${sr.label} ${formatTooltipValue(sr.values[i] ?? 0)}`)
                    .join(', ')}`}
                  className="cursor-pointer outline-none"
                  onPointerMove={onPointerMove(i)}
                  onPointerLeave={() => setHover(null)}
                  onFocus={onFocus(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            );
          })}
        </svg>
      )}

      {hover && categories[hover.index] !== undefined && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 min-w-[170px] -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm shadow-lg"
          style={{ left: tooltipLeft, top: hover.y - 10 }}
        >
          <p className="font-semibold text-ink">{categories[hover.index]}</p>
          <ul className="mt-1 space-y-0.5">
            {series.map((sr) => (
              <li key={sr.key} className="flex items-center justify-between gap-4 text-ink-2">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: sr.color }}
                  />
                  {sr.label}
                </span>
                <span className="font-semibold tabular-nums text-ink">
                  {formatTooltipValue(sr.values[hover.index] ?? 0)}
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
            <th scope="col">Category</th>
            {series.map((sr) => (
              <th key={sr.key} scope="col">
                {sr.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category, i) => (
            <tr key={category}>
              <th scope="row">{category}</th>
              {series.map((sr) => (
                <td key={sr.key}>{formatTooltipValue(sr.values[i] ?? 0)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
