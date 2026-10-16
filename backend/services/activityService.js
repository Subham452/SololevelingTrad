import ActivityLog from '../models/ActivityLog.js';
import LoginHistory from '../models/LoginHistory.js';
export const logActivity = (userId, action, meta = {}, ip = '') => ActivityLog.create({ userId, action, meta, ip });
export const logLogin = (userId, ip, userAgent, success) => LoginHistory.create({ userId, ip, userAgent, success });
