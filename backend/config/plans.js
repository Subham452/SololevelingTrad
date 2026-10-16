export const PLANS = {
  FREE: { id: 'FREE', name: 'Hunter', priceINR: 0, aiLimit: 100, features: ['basic'] },
  HUNTER: { id: 'HUNTER', name: 'Hunter', priceINR: 0, aiLimit: 100, features: ['basic'] },
  AWAKENED: { id: 'AWAKENED', name: 'Awakened', priceINR: 999, aiLimit: 2000, features: ['advanced'] },
  MONARCH: { id: 'MONARCH', name: 'Monarch', priceINR: 2499, aiLimit: 10000, features: ['all'] },
};
export const PLAN_IDS = Object.keys(PLANS);
export function getPlan(id) { const p = PLANS[String(id || '').toUpperCase()]; if (!p) throw Object.assign(new Error('Invalid plan'), { statusCode: 400 }); return p; }
export function checkUsageLimit(planId, used) { const p = getPlan(planId); return { allowed: used < p.aiLimit, limit: p.aiLimit, remaining: Math.max(0, p.aiLimit - used) }; }
