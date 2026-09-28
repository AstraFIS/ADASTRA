import { API_BASE_URL } from '@/config';
import { getToken } from './auth-storage';

const BASE_URL = API_BASE_URL;

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

/** Lets the auth provider react (sign out, redirect) whenever any request comes back 401. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const url = `${BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (err) {
    // DNS failure, server down, or a CORS rejection all surface here as a TypeError
    throw new ApiError(0, `Could not reach the API at ${BASE_URL} (${err instanceof Error ? err.message : 'network error'}). Check that the backend is running and allows this origin.`);
  }

  if (!res.ok) {
    // HTTP/2 responses carry no status text, so never rely on it alone
    let message = res.statusText ? `${res.statusText} (${res.status})` : `Request failed with status ${res.status}`;
    let details: ApiError['details'];
    try {
      const body = (await res.json()) as { error?: string; details?: ApiError['details'] };
      if (body.error) message = body.error;
      details = body.details;
    } catch {
      // response had no JSON body
    }
    // a 401 on the login/setup endpoints is a wrong password, not an expired session
    if (res.status === 401 && !path.startsWith('/auth/login') && !path.startsWith('/auth/setup')) {
      onUnauthorized?.();
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'disconnected' | 'connected' | 'connecting' | 'disconnecting';
  uptime: number;
  timestamp: string;
}
