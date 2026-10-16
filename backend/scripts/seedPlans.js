import mongoose from 'mongoose';
import env from '../config/env.js';

// ---------------------------------------------------------------------------
// Seeds the five launch pricing tiers. IDEMPOTENT — safe to run repeatedly.
//
// It only *creates* a plan whose slug does not already exist, so re-running
// (including on every server boot via `ensureSeedPlans`) never duplicates
// plans and never overwrites an administrator's live price edits.
//
//   node scripts/seedPlans.js
//   npm run seed:plans
// ---------------------------------------------------------------------------

if (!env.MONGODB_URI) { console.error('MONGODB_URI is required'); process.exit(1); }

await mongoose.connect(env.MONGODB_URI, { dbName: 'sololevelingtrad' });
const { ensureSeedPlans, DEFAULT_PLANS, listAllPlans } = await import('../services/planService.js');

console.log('Seeding pricing plans…');
console.log('  Expected launch tiers:');
for (const p of DEFAULT_PLANS) {
  console.log(`    ${p.name.padEnd(10)} ${p.slug.padEnd(10)} $${(p.priceCents / 100).toFixed(2)}/mo`);
}

const { created, skipped } = await ensureSeedPlans();

const all = await listAllPlans();
console.log(`\nResult: ${created} created, ${skipped} already existed (left untouched).`);
console.log(`Catalogue now has ${all.length} plan(s):`);
for (const p of all) {
  console.log(`    [${p.status.padEnd(9)}] ${p.name.padEnd(10)} ${p.slug.padEnd(10)} ${(p.priceCents / 100).toFixed(2)} ${p.currency} /${p.interval}`);
}

await mongoose.disconnect();
process.exit(0);
