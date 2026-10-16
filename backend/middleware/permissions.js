// Central permission map for backend-enforced RBAC.
// Route handlers declare the permission they need; requirePerm() resolves it
// against the caller's role. superadmin always passes. Frontend hiding is
// cosmetic only — every privileged route must use this middleware.

export const PERMISSIONS = {
  // users
  'users:read': ['admin', 'superadmin', 'support', 'analyst'],
  'users:write': ['admin', 'superadmin'],
  'users:suspend': ['admin', 'superadmin'],
  'users:delete': ['superadmin'],
  'users:impersonate_notes': ['admin', 'superadmin', 'support'],
  // finance
  'finance:read': ['admin', 'superadmin', 'finance', 'analyst'],
  'finance:refund': ['superadmin', 'finance'],
  'finance:subscriptions_write': ['superadmin', 'finance'],
  // Real-money wallet. Reads reuse finance:read; the two writes below are
  // deliberately narrow because they move or reverse customer funds.
  // Refunds: provider-side refund + an explicit reversal ledger entry.
  'finance:wallet_refund': ['superadmin', 'finance'],
  // Balance corrections: SUPERADMIN ONLY, evidence + reason required, and every
  // call writes an immutable AuditLog row. There is no "mark as paid" action.
  'wallet:adjust': ['superadmin'],
  // pricing & plans catalogue (revenue-config sensitive on the write side)
  'plans:read': ['admin', 'superadmin', 'finance', 'analyst'],
  'plans:write': ['superadmin', 'finance', 'admin'],
  // analytics
  'analytics:read': ['admin', 'superadmin', 'support', 'finance', 'analyst'],
  // moderation & comms
  'moderation:read': ['admin', 'superadmin', 'support'],
  'moderation:act': ['admin', 'superadmin', 'support'],
  'messages:read': ['admin', 'superadmin', 'support'],
  'messages:send': ['admin', 'superadmin', 'support'],
  'calls:read': ['admin', 'superadmin', 'support'],
  'calls:invite': ['admin', 'superadmin', 'support'],
  // security & platform
  'security:read': ['admin', 'superadmin'],
  'audit:read': ['superadmin', 'admin'],
  'settings:write': ['superadmin'],
  'roles:write': ['superadmin'],
  'notifications:send': ['admin', 'superadmin'],
};

export function can(role, permission) {
  if (role === 'superadmin') return true;
  const allowed = PERMISSIONS[permission] || [];
  return allowed.includes(role);
}

// Express middleware factory: requirePerm('finance:refund')
export const requirePerm = (permission) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (!can(req.user.role, permission)) return res.status(403).json({ success: false, message: `Forbidden: requires ${permission}` });
  next();
};
