import type { ChangeEvent } from 'react';

interface Option {
  value: string;
  label: string;
}

interface Props {
  id: string;
  label: string;
  value: string;
  options: Option[];
  onChange: (value: string) => void;
  className?: string;
}

export default function FilterSelect({ id, label, value, options, onChange, className = '' }: Props) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <label htmlFor={id} className="shrink-0 text-base text-ink-2">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <select
          id={id}
          value={value}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-line bg-surface-2 py-2.5 pl-4 pr-10 text-base font-medium text-ink focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue"
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
