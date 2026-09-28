/**
 * Creates the first admin account so that POST /api/users (admin-only) can be used.
 *
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='secret' npm run seed:admin -w backend
 *
 * Values can also live in backend/.env. Safe to re-run: it skips if the email exists.
 */
import 'dotenv/config';
import { connectDb, disconnectDb } from '../config/db.js';
import { User } from '../models/user.model.js';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME?.trim() || 'Administrator';

if (!email || !password) {
  console.error('[seed] ADMIN_EMAIL and ADMIN_PASSWORD are required');
  process.exit(1);
}
if (password.length < 8) {
  console.error('[seed] ADMIN_PASSWORD must be at least 8 characters');
  process.exit(1);
}

await connectDb();
try {
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`[seed] user ${email} already exists (role: ${existing.role}), nothing to do`);
  } else {
    const user = await User.create({
      name,
      email,
      role: 'admin',
      passwordHash: await User.hashPassword(password),
    });
    console.log(`[seed] created admin ${user.email} (id ${user.id})`);
  }
} finally {
  await disconnectDb();
}
