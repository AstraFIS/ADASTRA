import { Link, useLocation } from 'react-router-dom';

const VIEWS = [
  { path: '/platforms/facebook', label: 'Dashboard' },
  { path: '/platforms/facebook/insights', label: 'Creative insights' },
] as const;

/**
 * Switch between the Facebook dashboard and the creative insights page. Both read the same
 * filters from the URL, so the current selection carries over.
 */
export default function FacebookViewSwitch({ current }: { current: 'dashboard' | 'insights' }) {
  const { search } = useLocation();
  return (
    <nav aria-label="Facebook view" className="inline-flex rounded-xl border border-line bg-surface p-1">
      {VIEWS.map((v, i) => {
        const active = (i === 0 ? 'dashboard' : 'insights') === current;
        return (
          <Link
            key={v.path}
            to={`${v.path}${search}`}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
              active ? 'bg-surface-2 text-ink shadow-sm ring-1 ring-line-strong' : 'text-ink-3 hover:text-ink'
            }`}
          >
            {v.label}
          </Link>
        );
      })}
    </nav>
  );
}
