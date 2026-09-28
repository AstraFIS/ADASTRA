import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Overview', end: true },
  { to: '/platforms/facebook', label: 'Facebook', end: false },
];

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-baseline gap-2 border-b border-line px-5 py-4">
          <span className="text-lg font-bold tracking-tight text-ink">ADASTRA</span>
          <span className="text-xs font-medium uppercase tracking-wide text-ink-3">Admin</span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive ? 'bg-surface-2 text-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-line bg-surface px-6">
          <span className="text-sm font-semibold text-ink md:hidden">ADASTRA</span>
          <span className="hidden text-sm text-ink-3 md:inline">Media performance admin</span>
          <NavLink to="/login" className="text-sm font-medium text-ink-2 hover:text-ink">
            Sign out
          </NavLink>
        </header>
        <main className="flex-1 px-4 py-6 md:px-10 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
