import crypto from 'crypto';
export function generateOrderId(prefix = 'SLT') { const y = new Date().getFullYear(); const r = crypto.randomBytes(3).toString('hex').toUpperCase(); return `${prefix}-${y}-${r}`; }
