/**
 * Where the frontend talks to the API.
 *
 * - Development: the Vite dev server proxies `/api` to the local backend.
 * - Production builds: the deployed backend, unless VITE_API_URL overrides it
 *   at build time.
 */
const PRODUCTION_API_URL = 'https://adastra-backend-black.vercel.app/api';

export const API_BASE_URL: string =
  import.meta.env.VITE_API_URL || (import.meta.env.PROD ? PRODUCTION_API_URL : '/api');
