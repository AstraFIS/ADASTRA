import { useEffect, useId, useMemo, useRef, useState } from 'react';

/** "Provider||Account" — how a single account travels in the URL and the API (see the backend's ACCOUNT_SEP). */
export const ACCOUNT_SEP = '||';
/** A provider's rows that have no account_name. */
export const NO_ACCOUNT = '(no account)';

export interface ProviderAccounts {
  provider: string;
  accounts: string[];
}

interface Props {
  id: string;
  label: string;
  /** Whole providers selected. */
  providers: string[];
  /** Single accounts selected, as "Provider||Account". */
  accounts: string[];
  options: ProviderAccounts[];
  onChange: (providers: string[], accounts: string[]) => void;
  allLabel: string;
  className?: string;
}

const key = (p: string, a: string) => `${p}${ACCOUNT_SEP}${a}`;
const split = (k: string) => {
  const at = k.indexOf(ACCOUNT_SEP);
  return at > 0 ? { p: k.slice(0, at), a: k.slice(at + ACCOUNT_SEP.length) } : null;
};

/**
 * Provider filter with a breakdown by ad account: tick a provider for all its accounts,
 * or open it (▸) and tick single accounts. Nothing ticked means every provider. Like
 * MultiSearchSelect, the choice is applied once, when the list closes.
 */
export default function ProviderAccountSelect({
  id,
  label,
  providers,
  accounts,
  options,
  onChange,
  allLabel,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [whole, setWhole] = useState<string[]>(providers);
  const [parts, setParts] = useState<string[]>(accounts);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const root = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const listId = useId();

  // selected providers that are not in the option list any more still show (and can be unticked)
  const tree = useMemo(() => {
    const known = new Set(options.map((o) => o.provider));
    const extra = [...whole, ...parts.map((k) => split(k)?.p ?? '')]
      .filter((p) => p && !known.has(p))
      .map((p) => ({ provider: p, accounts: [] as string[] }));
    const seen = new Set<string>();
    return [...options, ...extra].filter((o) => (seen.has(o.provider) ? false : (seen.add(o.provider), true)));
  }, [options, whole, parts]);

  // accounts worth listing: only when a provider has at least one named account
  const childrenOf = (o: ProviderAccounts) => (o.accounts.some((a) => a !== NO_ACCOUNT) ? o.accounts : []);

  const q = query.trim().toLowerCase();
  const shown = useMemo(
    () =>
      tree
        .map((o) => {
          const kids = childrenOf(o);
          if (!q) return { ...o, kids };
          const selfHit = o.provider.toLowerCase().includes(q);
          const hitKids = kids.filter((a) => a.toLowerCase().includes(q));
          return selfHit || hitKids.length ? { ...o, kids: selfHit ? kids : hitKids, forceOpen: hitKids.length > 0 } : null;
        })
        .filter((o): o is ProviderAccounts & { kids: string[]; forceOpen?: boolean } => o !== null),
    [tree, q],
  );

  useEffect(() => {
    if (!open) return;
    setWhole(providers);
    setParts(accounts);
    setQuery('');
    // open the providers that have single accounts ticked
    setExpanded(new Set(accounts.map((k) => split(k)?.p ?? '').filter(Boolean)));
    requestAnimationFrame(() => search.current?.focus());
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) close();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const draft = useRef({ whole, parts });
  draft.current = { whole, parts };
  function close() {
    setOpen(false);
    const { whole: w, parts: a } = draft.current;
    const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
    if (!same(w, providers) || !same(a, accounts)) onChange(w, a);
  }

  const partsOf = (p: string) => parts.filter((k) => split(k)?.p === p);

  function toggleProvider(p: string) {
    if (whole.includes(p)) {
      setWhole(whole.filter((x) => x !== p));
    } else {
      setWhole([...whole, p]);
    }
    setParts(parts.filter((k) => split(k)?.p !== p));
  }

  function toggleAccount(o: ProviderAccounts, a: string) {
    const all = childrenOf(o);
    const k = key(o.provider, a);
    if (whole.includes(o.provider)) {
      // unticking one account of a whole provider keeps the others
      setWhole(whole.filter((x) => x !== o.provider));
      setParts([...parts, ...all.filter((x) => x !== a).map((x) => key(o.provider, x))]);
      return;
    }
    const next = parts.includes(k) ? parts.filter((x) => x !== k) : [...parts, k];
    const mine = next.filter((x) => split(x)?.p === o.provider);
    if (all.length > 0 && mine.length === all.length) {
      // every account ticked = the whole provider
      setWhole([...whole, o.provider]);
      setParts(next.filter((x) => split(x)?.p !== o.provider));
    } else {
      setParts(next);
    }
  }

  const toggleExpand = (p: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  const count = providers.length + accounts.length;
  const summary =
    count === 0
      ? allLabel
      : count === 1
        ? (providers[0] ?? split(accounts[0]!)?.a ?? accounts[0]!)
        : `${count} selected`;
  const title =
    [...providers, ...accounts.map((k) => {
      const s = split(k);
      return s ? `${s.p} › ${s.a}` : k;
    })].join('\n') || allLabel;
  const draftCount = whole.length + parts.length;

  const box = (state: 'on' | 'some' | 'off') => (
    <span
      aria-hidden="true"
      className={`grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-bold ${
        state === 'off' ? 'border-line-strong' : 'border-revenue bg-revenue text-canvas'
      }`}
    >
      {state === 'on' ? '✓' : state === 'some' ? '–' : ''}
    </span>
  );

  return (
    <div className={`flex items-center gap-3 ${className}`} ref={root}>
      <label htmlFor={id} className="shrink-0 text-base text-ink-2">
        {label}
      </label>
      <div className="relative min-w-0 flex-1">
        <button
          id={id}
          type="button"
          aria-haspopup="tree"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => (open ? close() : setOpen(true))}
          title={title}
          className={`flex w-full items-center gap-2 rounded-lg border bg-surface-2 py-2.5 pl-4 pr-10 text-left text-base font-medium text-ink focus:outline-none focus:ring-1 focus:ring-revenue ${
            open ? 'border-revenue' : 'border-line'
          }`}
        >
          <span className="truncate">{summary}</span>
          {count > 1 && (
            <span className="shrink-0 rounded-full bg-revenue px-2 py-0.5 text-xs font-bold text-canvas">{count}</span>
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
          <div className="absolute left-0 right-0 z-50 mt-1 min-w-[320px] overflow-hidden rounded-lg border border-line-strong bg-surface shadow-xl">
            <div className="border-b border-line p-2">
              <input
                ref={search}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') close();
                }}
                placeholder="Search provider or account…"
                aria-label={`Search ${label}`}
                className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 px-1 text-[11px]">
                <span className="text-ink-3">
                  {draftCount} selected · {tree.length} providers
                </span>
                <span className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setWhole([...new Set([...whole, ...shown.map((o) => o.provider)])]);
                      setParts(parts.filter((k) => !shown.some((o) => o.provider === split(k)?.p)));
                    }}
                    disabled={shown.length === 0}
                    className="font-semibold text-revenue hover:underline disabled:opacity-40"
                  >
                    {q ? 'Select shown' : 'Select all'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setWhole([]);
                      setParts([]);
                    }}
                    disabled={draftCount === 0}
                    className="font-semibold text-ink-2 hover:text-ink hover:underline disabled:opacity-40"
                  >
                    Clear
                  </button>
                </span>
              </div>
            </div>
            <ul id={listId} role="tree" aria-multiselectable="true" aria-label={label} className="max-h-80 overflow-y-auto py-1">
              {shown.length === 0 && <li className="px-4 py-2 text-sm text-ink-3">No match for “{query}”</li>}
              {shown.map((o) => {
                const isWhole = whole.includes(o.provider);
                const some = partsOf(o.provider).length;
                const state = isWhole ? 'on' : some ? 'some' : 'off';
                const isOpen = o.kids.length > 0 && (expanded.has(o.provider) || o.forceOpen === true);
                return (
                  <li key={o.provider} role="treeitem" aria-selected={isWhole} aria-expanded={o.kids.length ? isOpen : undefined}>
                    <div
                      className={`flex items-center gap-1 pr-3 text-sm hover:bg-surface-2 ${state !== 'off' ? 'text-ink' : 'text-ink-2'}`}
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleExpand(o.provider)}
                        disabled={o.kids.length === 0}
                        aria-label={isOpen ? `Hide ${o.provider} accounts` : `Show ${o.provider} accounts`}
                        className="grid h-8 w-7 shrink-0 place-items-center text-ink-3 hover:text-ink disabled:invisible"
                      >
                        <svg viewBox="0 0 20 20" className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth={2.2}>
                          <path d="M8 5l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      <div
                        role="checkbox"
                        aria-checked={state === 'on' ? true : state === 'some' ? 'mixed' : false}
                        tabIndex={0}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleProvider(o.provider)}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            toggleProvider(o.provider);
                          }
                        }}
                        title={o.provider}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2"
                      >
                        {box(state)}
                        <span className="truncate font-medium">{o.provider}</span>
                        {o.kids.length > 0 && (
                          <span className="ml-auto shrink-0 text-[11px] text-ink-3">
                            {some && !isWhole
                              ? `${some}/${o.kids.length}`
                              : `${o.kids.filter((a) => a !== NO_ACCOUNT).length} acc.`}
                          </span>
                        )}
                      </div>
                    </div>
                    {isOpen && (
                      <ul role="group">
                        {o.kids.map((a) => {
                          const on = isWhole || parts.includes(key(o.provider, a));
                          return (
                            <li
                              key={a}
                              role="treeitem"
                              aria-selected={on}
                              tabIndex={0}
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => toggleAccount(o, a)}
                              onKeyDown={(e) => {
                                if (e.key === ' ' || e.key === 'Enter') {
                                  e.preventDefault();
                                  toggleAccount(o, a);
                                }
                              }}
                              title={a}
                              className={`flex cursor-pointer items-center gap-2.5 py-1.5 pl-11 pr-3 text-[13px] hover:bg-surface-2 ${on ? 'text-ink' : 'text-ink-2'} ${a === NO_ACCOUNT ? 'italic' : ''}`}
                            >
                              {box(on ? 'on' : 'off')}
                              <span className="truncate">{a}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
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
