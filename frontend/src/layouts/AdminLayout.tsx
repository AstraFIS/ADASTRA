import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import ErrorBoundary from '@/components/ErrorBoundary';
import { canSeePlatform } from '@/lib/access';
import type { PlatformId } from '@/types/platforms';

const navItems: { to: string; label: string; end: boolean; adminOnly: boolean; platform?: PlatformId }[] = [
  { to: '/', label: 'Overview', end: true, adminOnly: false },
  { to: '/platforms/facebook', label: 'Facebook', end: false, adminOnly: false, platform: 'facebook' },
  { to: '/platforms/microsoft', label: 'Bing', end: false, adminOnly: false, platform: 'microsoft' },
  { to: '/users', label: 'Users', end: false, adminOnly: true },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleSignOut() {
    logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4 md:px-10">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="text-lg font-bold tracking-tight text-ink">ADASTRA</span>
            <span className="text-xs font-medium uppercase tracking-wide text-ink-3">Admin</span>
          </Link>

          <nav aria-label="Main" className="flex min-w-0 items-center gap-1 overflow-x-auto">
            {navItems
              .filter((item) => !item.adminOnly || user?.role === 'admin')
              .filter((item) => !item.platform || canSeePlatform(user, item.platform))
              .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
              ))}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-4 whitespace-nowrap">
            {user && (
              <span className="hidden text-sm text-ink-2 sm:inline">
                {user.name}
                <span className="ml-1.5 rounded bg-surface-2 px-1.5 py-0.5 text-xs font-medium uppercase text-ink-3">
                  {user.role}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="text-sm font-medium text-ink-2 hover:text-ink"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
          <ErrorBoundary label="This page">
            <Outlet />
          </ErrorBoundary>
        </main>
    </div>
  );
}
