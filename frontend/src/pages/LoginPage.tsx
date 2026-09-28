import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthContext';
import { api, ApiError } from '@/lib/api';
import type { AuthStatus } from '@/types/auth';

const inputClass =
  'mt-1 block w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue disabled:opacity-60';

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details?.length) return err.details.map((d) => d.message).join(' ');
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong';
}

export default function LoginPage() {
  const { status, login, setup } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState<'checking' | 'login' | 'setup'>('checking');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // find out whether the very first admin still has to be created
  useEffect(() => {
    let cancelled = false;
    api
      .get<AuthStatus>('/auth/status')
      .then((s) => {
        if (!cancelled) setMode(s.needsSetup ? 'setup' : 'login');
      })
      .catch(() => {
        if (!cancelled) setMode('login');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // signed-in users always start on the home page
  if (status === 'authenticated') return <Navigate to="/" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'setup' && password !== confirm) {
      setError('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      if (mode === 'setup') await setup({ name, email, password });
      else await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const isSetup = mode === 'setup';

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6"
        aria-busy={mode === 'checking'}
      >
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-ink-3">ADASTRA admin</p>
          <h1 className="mt-1 text-xl font-bold tracking-tight text-ink">
            {isSetup ? 'Create the first admin account' : 'Sign in'}
          </h1>
          <p className="mt-1 text-sm text-ink-2">
            {isSetup
              ? 'No accounts exist yet. This account will be the administrator.'
              : 'Enter your email and password to continue.'}
          </p>
        </div>

        {isSetup && (
          <label className="block">
            <span className="text-sm font-medium text-ink-2">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className={inputClass}
            />
          </label>
        )}

        <label className="block">
          <span className="text-sm font-medium text-ink-2">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            disabled={mode === 'checking'}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-ink-2">Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={isSetup ? 8 : 1}
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            disabled={mode === 'checking'}
            className={inputClass}
          />
        </label>

        {isSetup && (
          <label className="block">
            <span className="text-sm font-medium text-ink-2">Confirm password</span>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || mode === 'checking'}
          className="w-full rounded-lg bg-revenue px-4 py-2.5 text-sm font-bold text-canvas hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'Please wait…' : isSetup ? 'Create account & sign in' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
