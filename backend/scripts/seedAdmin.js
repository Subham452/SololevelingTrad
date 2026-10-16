import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import env from '../config/env.js';

// Seeds (or promotes) the initial administrator account from env vars.
// Idempotent: safe to re-run; it updates the existing account in place.
//
// SECURITY: there is deliberately NO default password. A hardcoded fallback
// would let anyone who reads the source log in as a superadmin. A brand-new
// account therefore requires an explicit ADMIN_PASSWORD.
const EMAIL = process.env.ADMIN_EMAIL || 'alex.admin@sololeveling.co';
const PASSWORD = process.env.ADMIN_PASSWORD || '';
const FIRST = process.env.ADMIN_FIRST_NAME || 'Alex';
const LAST = process.env.ADMIN_LAST_NAME || 'Admin';

if (!env.MONGODB_URI) { console.error('MONGODB_URI is required'); process.exit(1); }
await mongoose.connect(env.MONGODB_URI, { dbName: 'sololevelingtrad' });
const { default: User } = await import('../models/User.js');
const { default: AuditLog } = await import('../models/AuditLog.js');

const email = EMAIL.toLowerCase();
const existing = await User.findOne({ email });
if (!existing && !PASSWORD) {
  console.error('Refusing: set ADMIN_PASSWORD (min 12 chars) to create the administrator account.');
  process.exit(1);
}
if (PASSWORD && PASSWORD.length < 12) {
  console.error('Refusing: ADMIN_PASSWORD must be at least 12 characters.');
  process.exit(1);
}
const passwordHash = PASSWORD ? await bcrypt.hash(PASSWORD, 12) : undefined;

let user = existing;
if (user) {
  if (passwordHash) user.passwordHash = passwordHash;
  user.role = 'superadmin';
  user.status = 'active';
  user.emailVerified = true;
  user.firstName = user.firstName || FIRST;
  user.lastName = user.lastName || LAST;
  await user.save();
  console.log(`Updated existing admin ${email} (role=superadmin, status=active)`);
} else {
  user = await User.create({
    email, passwordHash, role: 'superadmin', status: 'active', emailVerified: true,
    firstName: FIRST, lastName: LAST, authProvider: 'email', plan: 'MONARCH',
  });
  console.log(`Created admin ${email} (role=superadmin)`);
}
await AuditLog.create({ actorId: user._id, action: 'seed_admin', target: String(user._id), meta: { email } });
console.log('Seeded admin audit entry.');
await mongoose.disconnect();
process.exit(0);
