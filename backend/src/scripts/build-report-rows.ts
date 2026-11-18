/**
 * Rebuilds facebook_report_rows — the one pre-merged collection every Facebook endpoint reads
 * (facebook_ad_reports + facebook_conversions + provider fees, see fbStatistics.service.ts).
 * The backend also rebuilds it by itself when the data changes; run this to do it right now.
 *
 *   npm run build:report-rows -w backend
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from '../config/db.js';
import { buildReportRows, REPORT_ROWS } from '../services/fbStatistics.service.js';
import mongoose from 'mongoose';

await connectDb();
try {
  const ok = await buildReportRows();
  const n = await mongoose.connection.collection(REPORT_ROWS).estimatedDocumentCount();
  console.log(ok ? `[report-rows] ${REPORT_ROWS}: ${n} rows` : '[report-rows] build failed (see above)');
  if (!ok) process.exitCode = 1;
} finally {
  await disconnectDb();
}
