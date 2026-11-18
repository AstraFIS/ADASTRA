import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

interface Props {
  id: string;
  label: string;
  /** Selected values; empty = all. */
  values: string[];
  options: string[];
  onChange: (values: string[]) => void;
  /** Shown when nothing is selected, e.g. "All Ads". */
  allLabel: string;
  /** Plural noun for the summary, e.g. "ads" → "3 ads selected". */
  noun: string;
  className?: string;
}

/**
 * A select box with a search field and tick boxes: pick one or several values.
 * Nothing ticked means "all". Type to narrow the list; "Select shown" ticks everything
 * that matches the search; Enter toggles the highlighted row. The choice is applied once,
 * when the list closes (Done, Esc or a click outside), so the page reloads only once.
 */
export default function MultiSearchSelect({ id, label, values, options, onChange, allLabel, noun, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState<string[]>(values);
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();
  const chosen = useMemo(() => new Set(draft), [draft]);

  // selected values first (also ones not in the option list any more), then the rest
  const all = useMemo(() => {
    const extra = draft.filter((v) => !options.includes(v));
    return [...extra, ...options];
  }, [options, draft]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? all.filter((o) => o.toLowerCase().includes(q)) : all;
  }, [all, query]);

  useEffect(() => {
    if (!open) return;
    setDraft(values);
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => search.current?.focus());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const toggle = (v: string) => setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  const selectShown = () => setDraft((d) => [...new Set([...d, ...filtered])]);
  const clear = () => setDraft([]);
  // apply the ticks once, when the list closes
  const draftRef = useRef(draft);
  draftRef.current = draft;
  function close() {
    setOpen(false);
    const next = draftRef.current;
    if (next.length !== values.length || next.some((v, i) => v !== values[i])) onChange(next);
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
      const v = filtered[active];
      if (v !== undefined) toggle(v);
    } else if (e.key === 'Escape') {
      close();
    }
  }

  const summary =
    values.length === 0 ? allLabel : values.length === 1 ? values[0]! : `${values.length} ${noun} selected`;

  return (
    <div className={`flex items-center gap-3 ${className}`} ref={root}>
      <label htmlFor={id} className="shrink-0 text-base text-ink-2">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => (open ? close() : setOpen(true))}
          title={values.join('\n') || allLabel}
          className={`flex w-full items-center gap-2 rounded-lg border bg-surface-2 py-2.5 pl-4 pr-10 text-left text-base font-medium text-ink focus:outline-none focus:ring-1 focus:ring-revenue ${
            open ? 'border-revenue' : 'border-line'
          }`}
        >
          <span className="truncate">{summary}</span>
          {values.length > 1 && (
            <span className="shrink-0 rounded-full bg-revenue px-2 py-0.5 text-xs font-bold text-canvas">{values.length}</span>
          )}
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
          <div className="absolute left-0 right-0 z-50 mt-1 min-w-[280px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xl">
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
                placeholder="Type to search…"
                aria-label={`Search ${label}`}
                aria-controls={listId}
                aria-activedescendant={filtered[active] !== undefined ? `${listId}-${active}` : undefined}
                className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11px]">
                <span className="text-ink-3">
                  {draft.length} selected · {filtered.length === all.length ? `${all.length} options` : `${filtered.length} of ${all.length}`}
                </span>
                <span className="flex gap-3">
                  <button type="button" onClick={selectShown} disabled={filtered.length === 0} className="font-semibold text-revenue hover:underline disabled:opacity-40">
                    {query ? 'Select shown' : 'Select all'}
                  </button>
                  <button type="button" onClick={clear} disabled={draft.length === 0} className="font-semibold text-ink-2 hover:text-ink hover:underline disabled:opacity-40">
                    Clear
                  </button>
                </span>
              </div>
            </div>
            <ul ref={list} id={listId} role="listbox" aria-multiselectable="true" aria-label={label} className="max-h-72 overflow-y-auto py-1">
              {filtered.length === 0 && <li className="px-4 py-2 text-sm text-ink-3">No match for “{query}”</li>}
              {filtered.map((o, i) => {
                const on = chosen.has(o);
                return (
                  <li
                    key={o}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={on}
                    onMouseEnter={() => setActive(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(o)}
                    title={o}
                    className={`flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm ${i === active ? 'bg-surface-2' : ''} ${on ? 'text-ink' : 'text-ink-2'}`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-bold ${
                        on ? 'border-revenue bg-revenue text-canvas' : 'border-line-strong'
                      }`}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span className="truncate">{o}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex justify-end border-t border-line p-2">
              <button
                type="button"
                onClick={close}
                className="rounded-md bg-revenue px-3 py-1.5 text-xs font-semibold text-canvas hover:opacity-90"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
