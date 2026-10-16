export const requireRoles = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (req.user.role === 'superadmin') return next();
  if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, message: 'Forbidden' });
  next();
};
export const requireAdmin = requireRoles('admin', 'superadmin');
// Broad staff gate for the admin panel shell. Individual routes still apply
// requirePerm() so a support analyst can never reach finance or role writes.
export const requireStaff = requireRoles('admin', 'superadmin', 'support', 'finance', 'analyst');
