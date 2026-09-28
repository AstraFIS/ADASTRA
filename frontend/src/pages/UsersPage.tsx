import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/auth/AuthContext';
import Modal from '@/components/Modal';
import UserForm from '@/components/UserForm';
import { formatDate } from '@/lib/format';
import { usersApi, type CreateUserInput, type UpdateUserInput } from '@/lib/users';
import type { AuthUser } from '@/types/auth';

type ListState =
  | { kind: 'loading' }
  | { kind: 'ok'; users: AuthUser[] }
  | { kind: 'error'; message: string };

type Dialog = { kind: 'create' } | { kind: 'edit'; user: AuthUser } | null;

function when(iso: string | null): string {
  return iso ? formatDate(iso.slice(0, 10), 'medium') : 'never';
}

export default function UsersPage() {
  const { user: me } = useAuth();
  const [state, setState] = useState<ListState>({ kind: 'loading' });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    usersApi
      .list()
      .then((users) => setState({ kind: 'ok', users }))
      .catch((err: unknown) =>
        setState({ kind: 'error', message: err instanceof Error ? err.message : 'Unknown error' }),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function patchList(updater: (users: AuthUser[]) => AuthUser[]) {
    setState((s) => (s.kind === 'ok' ? { kind: 'ok', users: updater(s.users) } : s));
  }

  async function handleCreate(input: CreateUserInput | UpdateUserInput) {
    const created = await usersApi.create(input as CreateUserInput);
    patchList((users) => [created, ...users]);
    setDialog(null);
    setNotice({ tone: 'ok', text: `Created ${created.email}` });
  }

  async function handleUpdate(id: string, input: CreateUserInput | UpdateUserInput) {
    const updated = await usersApi.update(id, input as UpdateUserInput);
    patchList((users) => users.map((u) => (u.id === id ? updated : u)));
    setDialog(null);
    setNotice({ tone: 'ok', text: `Saved ${updated.email}` });
  }

  async function handleDelete(user: AuthUser) {
    setBusyId(user.id);
    setNotice(null);
    try {
      await usersApi.remove(user.id);
      patchList((users) => users.filter((u) => u.id !== user.id));
      setNotice({ tone: 'ok', text: `Deleted ${user.email}` });
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Delete failed' });
    } finally {
      setBusyId(null);
      setConfirmDeleteId(null);
    }
  }

  async function toggleActive(user: AuthUser) {
    setBusyId(user.id);
    setNotice(null);
    try {
      const updated = await usersApi.update(user.id, { isActive: !user.isActive });
      patchList((users) => users.map((u) => (u.id === user.id ? updated : u)));
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.12em] text-ink-3">Administration</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Users</h1>
          <p className="mt-2 text-base text-ink-2">
            Accounts that can sign in to this admin panel. Admins can manage users; users can only view dashboards.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ kind: 'create' })}
          className="rounded-lg bg-revenue px-5 py-2.5 text-sm font-bold text-canvas hover:brightness-110"
        >
          + Add user
        </button>
      </header>

      {notice && (
        <p
          role="status"
          className={`rounded-lg border px-4 py-3 text-sm ${
            notice.tone === 'ok'
              ? 'border-revenue/40 bg-revenue/10 text-revenue'
              : 'border-loss/40 bg-loss/10 text-loss'
          }`}
        >
          {notice.text}
        </p>
      )}

      {state.kind === 'loading' && (
        <div className="animate-pulse rounded-xl border border-line bg-surface p-7 text-sm text-ink-3">
          Loading users…
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border border-loss/40 bg-surface p-6">
          <p className="font-semibold text-loss">Could not load users</p>
          <p className="mt-1 text-sm text-ink-2">{state.message}</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 rounded-lg border border-line bg-surface-2 px-4 py-2 text-sm font-semibold text-ink hover:bg-line"
          >
            Retry
          </button>
        </div>
      )}

      {state.kind === 'ok' && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2/60 text-left text-ink-2">
                <th className="px-5 py-3.5 font-semibold">Name</th>
                <th className="px-5 py-3.5 font-semibold">Email</th>
                <th className="px-5 py-3.5 font-semibold">Role</th>
                <th className="px-5 py-3.5 font-semibold">Status</th>
                <th className="px-5 py-3.5 font-semibold">Last login</th>
                <th className="px-5 py-3.5 font-semibold">Created</th>
                <th className="px-5 py-3.5 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {state.users.map((u) => {
                const isSelf = u.id === me?.id;
                const busy = busyId === u.id;
                return (
                  <tr key={u.id} className={`border-t border-line ${busy ? 'opacity-60' : ''}`}>
                    <td className="px-5 py-3 font-semibold text-ink">
                      {u.name}
                      {isSelf && <span className="ml-2 text-xs font-medium text-ink-3">(you)</span>}
                    </td>
                    <td className="px-5 py-3 text-ink">{u.email}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${
                          u.role === 'admin' ? 'bg-violet/15 text-violet' : 'bg-surface-2 text-ink-2'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 text-sm ${u.isActive ? 'text-revenue' : 'text-ink-3'}`}>
                        <span className={`inline-block h-2 w-2 rounded-full ${u.isActive ? 'bg-revenue' : 'bg-ink-3'}`} />
                        {u.isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-ink-2">{when(u.lastLoginAt)}</td>
                    <td className="px-5 py-3 text-ink-2">{when(u.createdAt)}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
                        {confirmDeleteId === u.id ? (
                          <>
                            <span className="self-center text-xs text-ink-2">Delete {u.email}?</span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleDelete(u)}
                              className="rounded-md bg-loss px-3 py-1.5 text-xs font-bold text-canvas hover:brightness-110 disabled:opacity-60"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink-2 hover:text-ink"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setDialog({ kind: 'edit', user: u })}
                              className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line"
                            >
                              Edit
                            </button>
                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => toggleActive(u)}
                                  className="rounded-md border border-line bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink hover:bg-line disabled:opacity-60"
                                >
                                  {u.isActive ? 'Deactivate' : 'Activate'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(u.id)}
                                  className="rounded-md border border-loss/40 px-3 py-1.5 text-xs font-semibold text-loss hover:bg-loss/10"
                                >
                                  Delete
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {dialog && me && (
        <Modal
          title={dialog.kind === 'create' ? 'Add user' : `Edit ${dialog.user.name}`}
          onClose={() => setDialog(null)}
        >
          <UserForm
            user={dialog.kind === 'edit' ? dialog.user : undefined}
            currentUserId={me.id}
            onCancel={() => setDialog(null)}
            onSubmit={(input) =>
              dialog.kind === 'create' ? handleCreate(input) : handleUpdate(dialog.user.id, input)
            }
          />
        </Modal>
      )}
    </div>
  );
}
