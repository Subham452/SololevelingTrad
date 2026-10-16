// Secure server-side provisioning for the designated administrator.
// Usage: ADMIN_EMAIL=alex.admin@sololeveling.co ADMIN_PASSWORD='...' ADMIN_SECRET=$(openssl rand -hex 32) node scripts/provisionAdmin.js
// Requires ADMIN_SECRET env to match, so users can never self-promote.
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();
const email = (process.env.ADMIN_EMAIL || 'alex.admin@sololeveling.co').toLowerCase();
if (!process.env.ADMIN_SECRET) { console.error('Refusing: set ADMIN_SECRET'); process.exit(1); }
if (!process.env.MONGODB_URI) { console.error('Refusing: MONGODB_URI not set'); process.exit(1); }
await mongoose.connect(process.env.MONGODB_URI);
const { default: User } = await import('../models/User.js');
const { default: AuditLog } = await import('../models/AuditLog.js');
let u = await User.findOne({ email });
const hash = process.env.ADMIN_PASSWORD ? await bcrypt.hash(process.env.ADMIN_PASSWORD, 12) : undefined;
if (!u) {
  if (!hash) { console.error('New admin needs ADMIN_PASSWORD'); process.exit(1); }
  u = await User.create({ email, passwordHash: hash, firstName: 'Administrator', role: 'superadmin', emailVerified: true, status: 'active' });
  console.log('Created superadmin:', email);
} else {
  u.role = 'superadmin'; u.status = 'active'; u.emailVerified = true;
  if (hash) u.passwordHash = hash;
  await u.save();
  console.log('Promoted to superadmin:', email);
}
await AuditLog.create({ action: 'admin_provision', target: String(u._id), meta: { email } });
await mongoose.disconnect();
