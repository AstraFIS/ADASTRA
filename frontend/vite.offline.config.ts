/**
 * Single-file build of the dashboard (npm run build:offline): JS and CSS inlined into one
 * index.html, the API answered inside the page (see src/lib/offline.ts). The data and the
 * in-page API are added by ../backend/static-build/make-offline.mjs.
 */
import { mergeConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import base from './vite.config';

export default mergeConfig(base, {
  plugins: [viteSingleFile()],
  define: { 'import.meta.env.VITE_OFFLINE': JSON.stringify('true') },
  build: { outDir: 'dist-offline', emptyOutDir: true },
});
