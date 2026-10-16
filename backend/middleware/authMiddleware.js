import { verifyAccess } from '../services/jwtService.js';
import User from '../models/User.js';
export const authenticate = async (req, res, next) => {
  try {
    const token = req.cookies?.accessToken || (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const decoded = verifyAccess(token);
    req.user = { sub: decoded.sub, firebaseUid: decoded.firebaseUid, role: decoded.role, sessionId: decoded.sessionId };
    const u = await User.findById(decoded.sub).select('lastActiveAt');
    if (u && (!u.lastActiveAt || Date.now() - new Date(u.lastActiveAt).getTime() > 5 * 60e3)) { u.lastActiveAt = new Date(); await u.save(); }
    next();
  } catch { return res.status(401).json({ success: false, message: 'Invalid or expired token' }); }
};
export const optionalAuth = async (req, _res, next) => {
  try {
    const token = req.cookies?.accessToken || (req.headers.authorization || '').replace(/^Bearer /, '');
    if (token) { const decoded = verifyAccess(token); req.user = { sub: decoded.sub, role: decoded.role }; }
  } catch { /* anonymous */ }
  next();
};
