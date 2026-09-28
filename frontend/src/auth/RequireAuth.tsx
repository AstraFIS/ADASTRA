import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** Route guard: renders child routes only for a signed-in user, otherwise sends them to /login. */
export default function RequireAuth() {
  const { status } = useAuth();

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-ink-3" aria-busy="true">
        Checking your session…
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
