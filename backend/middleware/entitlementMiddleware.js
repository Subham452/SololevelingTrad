import { currentSubscription } from '../services/subscriptionService.js';
import { asyncHandler } from '../utils/asyncHandler.js';

// Server-side plan gate. NEVER trust browser-sent plan/status fields.
// Free tier is represented by 'FREE' on User.plan; paid plans come from an
// active, unexpired Subscription record created only via verified payments.
// Includes both the legacy ids and the current pricing tiers (starter…ultimate).
const PAID = ['HUNTER', 'AWAKENED', 'MONARCH', 'STARTER', 'BASIC', 'PRO', 'ELITE', 'ULTIMATE'];

export function requireEntitlement(...allowedPlans) {
  return asyncHandler(async (req, res, next) => {
    const userPlan = String(req.userPlan || 'FREE').toUpperCase();
    if (allowedPlans.length === 0) {
      if (PAID.includes(userPlan)) return next();
    } else if (allowedPlans.map((p) => String(p).toUpperCase()).includes(userPlan)) {
      return next();
    }
    return res.status(402).json({
      success: false,
      message: 'This feature requires an eligible subscription',
      code: 'ENTITLEMENT_REQUIRED',
      requiredPlans: allowedPlans.length ? allowedPlans : PAID,
    });
  });
}

// Populates req.userPlan from trusted DB records (active sub or user.plan).
export async function attachEntitlement(req, _res, next) {
  try {
    const sub = await currentSubscription(req.user?.sub);
    req.userPlan = sub?.plan || req.user?.plan || 'FREE';
  } catch { req.userPlan = 'FREE'; }
  next();
}
