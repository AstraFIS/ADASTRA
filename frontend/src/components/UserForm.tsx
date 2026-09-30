import { useState, type FormEvent } from 'react';
import AccessListEditor from '@/components/AccessList';
import { FULL_ACCESS } from '@/lib/access';
import { ApiError } from '@/lib/api';
import type { CreateUserInput, UpdateUserInput } from '@/lib/users';
import type { AuthUser, UserAccess, UserRole } from '@/types/auth';

const inputClass =
  'mt-1 block w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue disabled:opacity-60';

interface Props {
  /** When set, the form edits this user; otherwise it creates one. */
  user?: AuthUser;
  /** The signed-in admin; their own role / active flag cannot be changed here. */
  currentUserId: string;
  onSubmit: (input: CreateUserInput | UpdateUserInput) => Promise<void>;
  onCancel: () => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof ApiError && err.details?.length) return err.details.map((d) => d.message).join(' ');
  return err instanceof Error ? err.message : 'Something went wrong';
}

export default function UserForm({ user, currentUserId, onSubmit, onCancel }: Props) {
  const editing = Boolean(user);
  const isSelf = user?.id === currentUserId;

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(user?.role ?? 'user');
  const [isActive, setIsActive] = useState(user?.isActive ?? true);
  const [access, setAccess] = useState<UserAccess>(user?.access ?? FULL_ACCESS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editing && user) {
        const changes: UpdateUserInput = {};
        if (name !== user.name) changes.name = name;
        if (email !== user.email) changes.email = email;
        if (password) changes.password = password;
        if (!isSelf && role !== user.role) changes.role = role;
        if (!isSelf && isActive !== user.isActive) changes.isActive = isActive;
        if (JSON.stringify(access) !== JSON.stringify(user.access)) changes.access = access;
        if (Object.keys(changes).length === 0) {
          onCancel();
          return;
        }
        await onSubmit(changes);
      } else {
        await onSubmit({ name, email, password, role, access });
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium text-ink-2">Name</span>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} className={inputClass} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink-2">Email</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-ink-2">
          {editing ? 'New password' : 'Password'}
          {editing && <span className="ml-1 text-ink-3">(leave blank to keep the current one)</span>}
        </span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={!editing}
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className="text-sm font-medium text-ink-2">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={isSelf}
            className={inputClass}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </select>
        </label>

        {editing && (
          <label className="block">
            <span className="text-sm font-medium text-ink-2">Status</span>
            <select
              value={isActive ? 'active' : 'inactive'}
              onChange={(e) => setIsActive(e.target.value === 'active')}
              disabled={isSelf}
              className={inputClass}
            >
              <option value="active">Active</option>
              <option value="inactive">Deactivated</option>
            </select>
          </label>
        )}
      </div>

      {isSelf && (
        <p className="text-xs text-ink-3">You cannot change your own role or deactivate yourself.</p>
      )}

      <AccessListEditor value={access} onChange={setAccess} role={role} />

      {error && (
        <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-line"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-revenue px-4 py-2 text-sm font-bold text-canvas hover:brightness-110 disabled:opacity-60"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
        </button>
      </div>
    </form>
  );
}
