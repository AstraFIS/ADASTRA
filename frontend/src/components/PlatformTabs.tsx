import { NavLink } from 'react-router-dom';
import { PLATFORM_ICONS, type PlatformSummary } from '@/types/platforms';

interface Props {
  platforms: PlatformSummary[];
}

const base =
  'inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors';

export default function PlatformTabs({ platforms }: Props) {
  return (
    <nav aria-label="Platforms" className="flex flex-wrap gap-3">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `${base} ${
            isActive
              ? 'border-revenue bg-surface text-revenue'
              : 'border-transparent bg-surface-2 text-ink-2 hover:text-ink'
          }`
        }
      >
        <span aria-hidden="true">🌐</span>
        All Platforms
      </NavLink>

      {platforms.map((p) =>
        p.connected ? (
          <NavLink
            key={p.id}
            to={`/platforms/${p.id}`}
            className={({ isActive }) =>
              `${base} ${
                isActive
                  ? 'border-revenue bg-surface text-revenue'
                  : 'border-transparent bg-surface-2 text-ink hover:bg-line'
              }`
            }
          >
            <span aria-hidden="true">{PLATFORM_ICONS[p.id]}</span>
            {p.name}
          </NavLink>
        ) : (
          <span
            key={p.id}
            aria-disabled="true"
            title={`${p.name} is not yet connected`}
            className={`${base} cursor-not-allowed border-transparent bg-surface-2 text-ink-3`}
          >
            <span aria-hidden="true" className="text-xs">🔒</span>
            {p.name}
          </span>
        ),
      )}
    </nav>
  );
}
