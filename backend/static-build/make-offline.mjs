/**
 * Builds ONE html file of the real Facebook dashboard that opens from disk with no server:
 *   1. the workbook rows → JSON (export-data.ts)
 *   2. the backend's Facebook controllers bundled for the browser (build-api.mjs)
 *   3. the frontend built as a single file in offline mode (frontend: vite.offline.config.ts)
 *   4. 1–3 stitched together into <out.html>
 *
 *   cd backend && npm run build:offline [-- <out.html>]
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backend = path.resolve(here, '..');
const frontend = path.resolve(backend, '../frontend');
const out = path.resolve(process.argv[2] ?? path.join(backend, 'Facebook_Dashboard_offline.html'));
const tmp = mkdtempSync(path.join(os.tmpdir(), 'adastra-offline-'));
const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'inherit' });

run(`npx tsx static-build/export-data.ts "${tmp}/data.json"`, backend);
run(`node static-build/build-api.mjs "${tmp}/api.js"`, backend);
run(`npx vite build --config vite.offline.config.ts`, frontend);

// text inside <script> must not contain "</script" — escape every "</"
const safe = (s) => s.replace(/<\//g, '<\\/');
const api = readFileSync(`${tmp}/api.js`, 'utf8');
const data = readFileSync(`${tmp}/data.json`, 'utf8');
let html = readFileSync(path.join(frontend, 'dist-offline/index.html'), 'utf8');

const inject =
  `<script type="application/json" id="offline-data">${safe(data)}</script>\n` +
  `<script>${safe(api)}\nAdastraOfflineApi.loadData(JSON.parse(document.getElementById('offline-data').textContent));</script>\n`;
// before the app's module script so the API is ready when React starts
const at = html.indexOf('<script type="module"');
html = at >= 0 ? html.slice(0, at) + inject + html.slice(at) : html.replace('</head>', `${inject}</head>`);
html = html.replace(/<title>[^<]*<\/title>/, '<title>ADASTRA – Facebook (offline copy)</title>');

for (const bad of ['mongodb+srv', 'mongodb://']) if (html.includes(bad)) throw new Error(`refusing to write: found "${bad}"`);
writeFileSync(out, html);
console.log(`[static] ${out} (${(html.length / 1048576).toFixed(1)} MB)`);
