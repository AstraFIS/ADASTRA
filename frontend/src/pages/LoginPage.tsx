import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const inputClass =
  'mt-1 block w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-ink-3 focus:border-revenue focus:outline-none focus:ring-1 focus:ring-revenue';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // TODO: wire up to POST /api/auth/login once the auth module exists
    navigate('/');
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-line bg-surface p-6"
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-ink-2">ADASTRA admin panel</p>
        </div>

        <label className="block">
          <span className="text-sm font-medium text-ink-2">Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
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
            className={inputClass}
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-lg bg-revenue px-4 py-2.5 text-sm font-bold text-canvas hover:brightness-110"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
