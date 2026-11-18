/** Reads the demo workbook (same code as Excel mode) and writes the store as JSON for the offline HTML. */
import { writeFileSync } from 'node:fs';
import { EXCEL_FILE, readWorkbook } from '../src/config/demo.js';

const out = process.argv[2] ?? 'static-data.json';
const store = await readWorkbook(EXCEL_FILE);
writeFileSync(out, JSON.stringify(store));
console.log(`[static] ${store.facebook_ad_reports!.length} Meta rows + ${store.facebook_conversions!.length} partner events → ${out}`);
