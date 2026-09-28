import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from '@/lib/api';
import { clearToken, getToken, setToken } from '@/lib/auth-storage';
import type { AuthResponse, AuthUser } from '@/types/auth';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface SetupInput {
  name: string;
  email: string;
  password: string;
}

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<AuthUser>;
  setup: (input: SetupInput) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() => (getToken() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<AuthUser | null>(null);

  const signOut = useCallback(() => {
    clearToken();
    setUser(null);
    setStatus('anonymous');
  }, []);

  // any 401 from the API (expired token, deactivated account) ends the session
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  // validate a stored token on first load
  useEffect(() => {
    if (!getToken()) return;
    let cancelled = false;
    api
      .get<{ user: AuthUser }>('/auth/me')
      .then(({ user: me }) => {
        if (cancelled) return;
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => {
        if (!cancelled) signOut();
      });
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  const acceptSession = useCallback((res: AuthResponse) => {
    setToken(res.token);
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  const login = useCallback(
    async (email: string, password: string) =>
      acceptSession(await api.post<AuthResponse>('/auth/login', { email, password })),
    [acceptSession],
  );

  const setup = useCallback(
    async (input: SetupInput) => acceptSession(await api.post<AuthResponse>('/auth/setup', input)),
    [acceptSession],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, login, setup, logout: signOut }),
    [status, user, login, setup, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
