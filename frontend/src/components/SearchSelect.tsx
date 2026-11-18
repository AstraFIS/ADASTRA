import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

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
  /** Keep the label for screen readers only. */
  hideLabel?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * A select box with a search field: click it, type part of a name, pick with the mouse or
 * ↑ / ↓ + Enter. Same props as FilterSelect, so the two are interchangeable.
 */
export default function SearchSelect({
  id,
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  className = '',
  placeholder = 'Type to search…',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  const current = options.find((o) => o.value === value) ?? options[0];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q));
  }, [options, query]);

  // open: clear the search, highlight the current choice, focus the search field
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    requestAnimationFrame(() => search.current?.focus());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // close on a click outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // keep the highlighted row in view
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  function choose(o: Option | undefined) {
    if (!o) return;
    onChange(o.value);
    setOpen(false);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(filtered[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={`flex items-center gap-3 ${className}`} ref={root}>
      <label htmlFor={id} className={hideLabel ? 'sr-only' : 'shrink-0 text-base text-ink-2'}>
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((o) => !o)}
          className={`w-full truncate rounded-lg border bg-surface-2 py-2.5 pl-4 pr-10 text-left text-base font-medium text-ink focus:outline-none focus:ring-1 focus:ring-revenue ${
            open ? 'border-revenue' : 'border-line'
          }`}
          title={current?.label}
        >
          {current?.label ?? '—'}
        </button>
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={`pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {open && (
          <div className="absolute left-0 right-0 z-50 mt-1 min-w-[240px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xl">
            <div className="border-b border-line p-2">
              <input
                ref={search}
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKey}
                placeholder={placeholder}
                aria-label={`Search ${label}`}
                aria-controls={listId}
                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none"
              />
              <p className="mt-1 px-1 text-[11px] text-ink-3">
                {filtered.length === options.length ? `${options.length} options` : `${filtered.length} of ${options.length}`}
              </p>
            </div>
            <ul ref={list} id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 && <li className="px-4 py-2 text-sm text-ink-3">No match for “{query}”</li>}
              {filtered.map((o, i) => {
                const selected = o.value === value;
                return (
                  <li
                    key={`${o.value}|${i}`}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={selected}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(o)}
                    className={`cursor-pointer truncate px-4 py-2 text-sm ${
                      i === active ? 'bg-surface-2 text-ink' : 'text-ink-2'
                    } ${selected ? 'font-semibold text-revenue' : ''}`}
                    title={o.label}
                  >
                    {selected ? '✓ ' : ''}
                    {o.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
