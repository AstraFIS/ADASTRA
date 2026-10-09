export type StatTone = 'revenue' | 'spend' | 'loss' | 'accent' | 'neutral';
export type CaptionTone = 'default' | 'good' | 'bad';

interface Props {
  label: string;
  value: string;
  caption: string;
  tone?: StatTone;
  size?: 'lg' | 'md' | 'sm';
  /** Colour the caption as a good/bad comparison (e.g. "33% below account avg"). */
  captionTone?: CaptionTone;
}

const toneClasses: Record<StatTone, { border: string; text: string }> = {
  revenue: { border: 'border-l-[3px] border-l-revenue', text: 'text-revenue' },
  spend: { border: 'border-l-[3px] border-l-spend', text: 'text-spend' },
  loss: { border: 'border-l-[3px] border-l-loss', text: 'text-loss' },
  accent: { border: 'border-l-[3px] border-l-azure', text: 'text-ink' },
  neutral: { border: '', text: 'text-ink' },
};

// The value scales with the tile's own width (container-query units) so a long
// figure like "−$1,370.70" shrinks a little in a narrow tile instead of clipping.
const captionClasses: Record<CaptionTone, string> = {
  default: 'text-ink-2',
  good: 'font-semibold text-revenue',
  bad: 'font-semibold text-loss',
};

const valueSize = {
  lg: 'text-[clamp(1.25rem,17cqw,2.25rem)]',
  md: 'text-[clamp(1.25rem,17cqw,1.875rem)]',
  sm: 'text-[clamp(1.05rem,14cqw,1.5rem)]',
};

export default function StatCard({
  label,
  value,
  caption,
  tone = 'neutral',
  size = 'lg',
  captionTone = 'default',
}: Props) {
  const t = toneClasses[tone];
  const pad = size === 'lg' ? 'px-7 py-6' : size === 'md' ? 'px-6 py-5' : 'px-4 py-3';
  const gap = size === 'sm' ? 'mt-1.5' : 'mt-3';

  return (
    <div className={`@container min-w-0 rounded-xl border border-line bg-surface ${pad} ${t.border}`}>
      <p className={`truncate font-medium uppercase tracking-[0.08em] text-ink-2 ${size === 'sm' ? 'text-[11px]' : 'text-xs'}`}>{label}</p>
      <p
        className={`${gap} truncate font-bold leading-tight tabular-nums tracking-tight ${valueSize[size]} ${t.text}`}
        title={value}
      >
        {value}
      </p>
      <p
        className={`${gap} ${size === 'sm' ? 'text-xs' : 'text-sm'} ${captionClasses[captionTone]} ${size === 'lg' ? '' : 'truncate'}`}
        title={caption}
      >
        {caption}
      </p>
    </div>
  );
}
