/**
 * Offline copy: the dashboard as ONE html file (npm run build:offline). There is no server —
 * the Facebook endpoints run inside the page (window.AdastraOfflineApi, from
 * backend/static-build) on the data embedded in the file.
 */
export const OFFLINE = import.meta.env.VITE_OFFLINE === 'true';

interface OfflineApi {
  handle(method: string, path: string): Promise<{ status: number; body: unknown }>;
}

export function offlineApi(): OfflineApi {
  const api = (window as unknown as { AdastraOfflineApi?: OfflineApi }).AdastraOfflineApi;
  if (!api) throw new Error('The offline data is missing from this file.');
  return api;
}
