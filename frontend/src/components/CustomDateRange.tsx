import { useState, type FormEvent } from 'react';

interface Props {
  /** Applied bounds, YYYY-MM-DD ('' when not set). Remount with a `key` to reset the fields to them. */
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  className?: string;
}

const inputClass =
  'rounded-lg border border-line bg-surface-2 px-4 py-2.5 text-base font-medium text-ink focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue';

/**
 * From / To day pickers for a custom date range. Edits stay local until Apply
 * (or Enter), so half-typed dates never trigger a reload.
 */
export default function CustomDateRange({ from, to, onApply, className = '' }: Props) {
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);

  const complete = draftFrom !== '' && draftTo !== '';
  const ordered = !complete || draftFrom <= draftTo;
  const dirty = draftFrom !== from || draftTo !== to;
  const canApply = complete && ordered && dirty;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (canApply) onApply(draftFrom, draftTo);
  }

  return (
    <form onSubmit={submit} className={`flex flex-wrap items-center gap-3 ${className}`}>
      <label htmlFor="date-from" className="text-base text-ink-2">
        From
      </label>
      <input
        id="date-from"
        type="date"
        value={draftFrom}
        onChange={(e) => setDraftFrom(e.target.value)}
        aria-invalid={!ordered}
        className={inputClass}
      />
      <label htmlFor="date-to" className="text-base text-ink-2">
        To
      </label>
      <input
        id="date-to"
        type="date"
        value={draftTo}
        onChange={(e) => setDraftTo(e.target.value)}
        aria-invalid={!ordered}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={!canApply}
        className="rounded-lg bg-revenue px-5 py-2.5 text-base font-bold text-canvas transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:border disabled:border-line disabled:bg-surface-2 disabled:text-ink-3 disabled:hover:brightness-100"
      >
        Apply
      </button>
      {!ordered && (
        <p role="alert" className="text-sm text-loss">
          From must not be after To.
        </p>
      )}
    </form>
  );
}
