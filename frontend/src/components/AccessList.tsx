import { FACEBOOK_ACCESS_GROUPS, type FacebookAccessGroup, type UserAccess, type UserRole } from '@/types/auth';

interface EditorProps {
  value: UserAccess;
  onChange: (next: UserAccess) => void;
  /** Admins see everything, so their list is shown but cannot be edited. */
  role: UserRole;
  disabled?: boolean;
}

const checkboxClass = 'h-4 w-4 rounded border-line accent-revenue disabled:opacity-60';

/** Platform / ad-group checklist used in the user form. */
export default function AccessListEditor({ value, onChange, role, disabled = false }: EditorProps) {
  const isAdmin = role === 'admin';
  const locked = disabled || isAdmin;

  function toggleGroup(group: FacebookAccessGroup, on: boolean) {
    const groups = on ? [...value.facebook, group] : value.facebook.filter((g) => g !== group);
    // keep the canonical order so the form's "changed?" comparison is stable
    onChange({ ...value, facebook: FACEBOOK_ACCESS_GROUPS.filter((g) => groups.includes(g)) });
  }

  return (
    <fieldset className="rounded-lg border border-line bg-surface-2/40 p-4">
      <legend className="px-1 text-sm font-medium text-ink-2">Access</legend>

      {isAdmin && <p className="mb-3 text-xs text-ink-3">Admins can see every platform and every ad.</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="w-20 text-sm font-semibold text-ink">Facebook</span>
          {FACEBOOK_ACCESS_GROUPS.map((group) => (
            <label key={group} className="inline-flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={isAdmin || value.facebook.includes(group)}
                onChange={(e) => toggleGroup(group, e.target.checked)}
                disabled={locked}
                className={checkboxClass}
              />
              {group}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="w-20 text-sm font-semibold text-ink">Google</span>
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isAdmin || value.google}
              onChange={(e) => onChange({ ...value, google: e.target.checked })}
              disabled={locked}
              className={checkboxClass}
            />
            Can view
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="w-20 text-sm font-semibold text-ink">Bing</span>
          <label className="inline-flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isAdmin || value.microsoft}
              onChange={(e) => onChange({ ...value, microsoft: e.target.checked })}
              disabled={locked}
              className={checkboxClass}
            />
            Can view
          </label>
        </div>
      </div>

      {!isAdmin && (
        <p className="mt-3 text-xs text-ink-3">
          Meta1 / Meta2 are the Facebook ad groups in the ad access list. With both, the user sees every Facebook
          ad; with one, only that group's ads.
        </p>
      )}
    </fieldset>
  );
}

const chipClass = 'rounded-full px-2.5 py-0.5 text-xs font-semibold';

/** Compact read-only summary for the users table. */
export function AccessSummary({ access, role }: { access: UserAccess; role: UserRole }) {
  if (role === 'admin') {
    return <span className={`${chipClass} bg-violet/15 text-violet`}>All access</span>;
  }

  const chips: string[] = [];
  if (access.facebook.length) chips.push(`Facebook · ${access.facebook.join(', ')}`);
  if (access.google) chips.push('Google');
  if (access.microsoft) chips.push('Bing');

  if (!chips.length) return <span className="text-xs text-ink-3">No access</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((c) => (
        <span key={c} className={`${chipClass} bg-surface-2 text-ink-2`}>
          {c}
        </span>
      ))}
    </div>
  );
}
