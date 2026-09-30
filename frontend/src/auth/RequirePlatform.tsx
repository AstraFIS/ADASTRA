import { Link, Outlet } from 'react-router-dom';
import { canSeePlatform } from '@/lib/access';
import type { PlatformId } from '@/types/platforms';
import { useAuth } from './AuthContext';

/** Use inside RequireAuth. Renders child routes only when the user's access list includes the platform. */
export default function RequirePlatform({ platform }: { platform: PlatformId }) {
  const { user } = useAuth();

  if (!canSeePlatform(user, platform)) return <NoPlatformAccess />;
  return <Outlet />;
}

export function NoPlatformAccess() {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-line bg-surface p-7 text-center">
      <p className="text-lg font-bold text-ink">No access</p>
      <p className="mt-2 text-sm text-ink-2">
        This platform is not on your access list. Ask an admin if you need it.
      </p>
      <Link to="/" className="mt-5 inline-block text-sm font-medium text-revenue underline">
        Back to overview
      </Link>
    </div>
  );
}
