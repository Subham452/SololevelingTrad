import Notification from '../models/Notification.js';
export const notify = (userId, title, body) => Notification.create({ userId, title, body });
export const notifyMany = async (userIds, title, body) => Notification.insertMany(userIds.map(u => ({ userId: u, title, body })));
