import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import env from '../config/env.js';
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
export function signAccess(payload) { return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES }); }
export function signRefresh(payload) { return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: `${env.JWT_REFRESH_DAYS}d` }); }
export function verifyAccess(t) { return jwt.verify(t, env.JWT_ACCESS_SECRET); }
export function verifyRefresh(t) { return jwt.verify(t, env.JWT_REFRESH_SECRET); }
export function setAuthCookies(res, access, refresh) {
  res.cookie('accessToken', access, { httpOnly: true, sameSite: 'strict', secure: env.NODE_ENV === 'production', maxAge: 15 * 60 * 1000 });
  res.cookie('refreshToken', refresh, { httpOnly: true, sameSite: 'strict', secure: env.NODE_ENV === 'production', maxAge: env.JWT_REFRESH_DAYS * 864e5, path: '/' });
}
export function clearAuthCookies(res) { res.clearCookie('accessToken'); res.clearCookie('refreshToken'); }
