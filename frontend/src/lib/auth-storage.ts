import { OFFLINE } from './offline';

const TOKEN_KEY = 'adastra.token';

// localStorage can be unavailable (private mode, blocked storage); never let that crash the app.
export function getToken(): string | null {
  if (OFFLINE) return 'offline'; // single-file copy: always signed in as the demo user
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // storage unavailable: the session just won't survive a reload
  }
}

export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}
