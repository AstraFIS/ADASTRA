import { Link, Outlet } from 'react-router-dom';
import type { UserRole } from '@/types/auth';
import { useAuth } from './AuthContext';

/** Use inside RequireAuth. Renders child routes only for the given roles. */
export default function RequireRole({ roles }: { roles: UserRole[] }) {
  const { user } = useAuth();

  if (!user || !roles.includes(user.role)) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-line bg-surface p-7 text-center">
        <p className="text-lg font-bold text-ink">Admins only</p>
        <p className="mt-2 text-sm text-ink-2">
          Your account ({user?.role ?? 'unknown'}) does not have access to this page.
        </p>
        <Link to="/" className="mt-5 inline-block text-sm font-medium text-revenue underline">
          Back to overview
        </Link>
      </div>
    );
  }

  return <Outlet />;
}
