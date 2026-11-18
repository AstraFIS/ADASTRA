/**
 * Bundles static-build/browserApi.ts (the Facebook controllers + services) for the browser.
 * Node-only modules are replaced by small stubs, and src/config/settings.ts is replaced by an
 * empty one so no connection string or secret ever ends up in the offline HTML.
 *
 *   node static-build/build-api.mjs <out.js>
 */
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] ?? path.join(here, 'browser-api.js');

// anything: callable, constructible, every property is itself — enough for model/schema setup code
const ANY = `const any = new Proxy(function () {}, {
  get: (t, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => '' : k === 'prototype' ? {} : any),
  apply: () => any,
  construct: () => any,
});`;

const STUBS = {
  mongoose: `${ANY} export default any; export const Schema = any, model = any, models = any, Types = any, connection = any, set = any;`,
  exceljs: `${ANY} export default any;`,
  'dotenv/config': ``,
  fs: `export const existsSync = () => true, statSync = () => ({ mtimeMs: 1 }), readFileSync = () => '', writeFileSync = () => {}; export default { existsSync, statSync, readFileSync, writeFileSync };`,
  path: `const join = (...p) => p.filter(Boolean).join('/'); export const resolve = join, dirname = (p) => String(p).split('/').slice(0, -1).join('/'), basename = (p) => String(p).split('/').pop(); export { join }; export default { join, resolve, dirname, basename };`,
  url: `export const fileURLToPath = (u) => String(u); export default { fileURLToPath };`,
  crypto: `${ANY} export const createHash = () => ({ update: () => ({ digest: () => 'offline' }) }); export const randomBytes = any; export default { createHash, randomBytes };`,
  settings: `export const SETTINGS = { MONGODB_URI: '', MONGODB_DB_NAME: 'offline', JWT_SECRET: 'offline-copy-no-secret-inside-0000000000', JWT_EXPIRES_IN: '7d', CLIENT_ORIGINS: [], NODE_ENV: 'production', PORT: 0 };`,
};
const NAME = { 'node:fs': 'fs', 'node:path': 'path', 'node:url': 'url', 'node:crypto': 'crypto' };

await build({
  entryPoints: [path.join(here, 'browserApi.ts')],
  bundle: true,
  format: 'iife',
  globalName: 'AdastraOfflineApi',
  platform: 'browser',
  target: 'es2020',
  minify: true,
  outfile: out,
  define: {
    'process.env': JSON.stringify({ DATA_SOURCE: 'excel', NODE_ENV: 'production' }),
    'process.env.NODE_ENV': '"production"',
  },
  banner: { js: 'var process = { env: { DATA_SOURCE: "excel" }, cwd: () => "/", uptime: () => 0, on: () => {}, exitCode: 0, platform: "browser" };' },
  plugins: [
    {
      name: 'offline-stubs',
      setup(b) {
        b.onResolve({ filter: /^(mongoose|exceljs|dotenv\/config|node:fs|fs|node:path|path|node:url|url|node:crypto|crypto)$/ }, (a) => ({
          path: NAME[a.path] ?? a.path,
          namespace: 'stub',
        }));
        b.onResolve({ filter: /config\/settings(\.js)?$/ }, () => ({ path: 'settings', namespace: 'stub' }));
        b.onLoad({ filter: /.*/, namespace: 'stub' }, (a) => ({ contents: STUBS[a.path] ?? '', loader: 'js' }));
      },
    },
  ],
  logLevel: 'warning',
});
console.log(`[static] browser API → ${out}`);
