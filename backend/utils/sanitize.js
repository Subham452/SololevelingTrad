const KEYS = ['password', 'otp', 'token', 'refreshToken', 'otpHash', 'refreshTokenHash', 'privateKey'];
export function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitize);
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = KEYS.some(s => k.toLowerCase().includes(s.toLowerCase())) ? '[REDACTED]' : (v && typeof v === 'object' ? sanitize(v) : v);
  return out;
}
export function paginate(query) { const page = Math.min(Math.max(parseInt(query.page) || 1, 1), 1000); const limit = Math.min(Math.max(parseInt(query.limit) || 20, 1), 100); return { page, limit, skip: (page - 1) * limit }; }
