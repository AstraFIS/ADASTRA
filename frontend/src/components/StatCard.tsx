export type StatTone = 'revenue' | 'spend' | 'loss' | 'accent' | 'neutral';
export type CaptionTone = 'default' | 'good' | 'bad';

interface Props {
  label: string;
  value: string;
  caption: string;
  tone?: StatTone;
  size?: 'lg' | 'md';
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
  const pad = size === 'lg' ? 'px-7 py-6' : 'px-6 py-5';

  return (
    <div className={`@container min-w-0 rounded-xl border border-line bg-surface ${pad} ${t.border}`}>
      <p className="truncate text-xs font-medium uppercase tracking-[0.08em] text-ink-2">{label}</p>
      <p
        className={`mt-3 truncate font-bold leading-tight tabular-nums tracking-tight ${valueSize[size]} ${t.text}`}
        title={value}
      >
        {value}
      </p>
      <p
        className={`mt-3 text-sm ${captionClasses[captionTone]} ${size === 'md' ? 'truncate' : ''}`}
        title={caption}
      >
        {caption}
      </p>
    </div>
  );
}
