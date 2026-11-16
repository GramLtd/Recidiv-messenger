// Usage: npm run make-admin -- user@example.com
import { db } from '../db.js';

const email = (process.argv[2] || '').toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- <email>');
  process.exit(1);
}
const r = db.prepare('UPDATE users SET is_admin = 1 WHERE email = ?').run(email);
console.log(r.changes ? `✅ ${email} is now an admin` : `❌ user ${email} not found`);
