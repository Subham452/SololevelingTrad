import crypto from 'crypto';
import { Group, GroupMembership, GroupMessage, GroupInvitation } from '../models/Group.js';

const genCode = () => crypto.randomBytes(8).toString('hex');

export async function isMember(groupId, userId) {
  return !!(await GroupMembership.findOne({ groupId, userId }));
}

export async function roleOf(groupId, userId) {
  const m = await GroupMembership.findOne({ groupId, userId }).lean();
  return m?.role || null;
}

export async function createGroup(userId, { name, description, isPublic }) {
  const code = genCode();
  const g = await Group.create({ name, description: description || '', isPublic: !!isPublic, ownerId: userId, inviteCode: code });
  await GroupMembership.create({ groupId: g._id, userId, role: 'owner' });
  return g;
}

export async function listGroups(userId) {
  const memberships = await GroupMembership.find({ userId }).lean();
  const ids = memberships.map((m) => m.groupId);
  const groups = await Group.find({ $or: [{ _id: { $in: ids } }, { isPublic: true }] }).lean();
  return groups.map((g) => ({ ...g, role: memberships.find((m) => String(m.groupId) === String(g._id))?.role || null }));
}

export async function joinByInvite(userId, code) {
  const g = await Group.findOne({ inviteCode: code });
  if (!g) { const e = new Error('Invalid invite code'); e.statusCode = 404; throw e; }
  await GroupMembership.updateOne({ groupId: g._id, userId }, { $setOnInsert: { role: 'member' } }, { upsert: true });
  return g;
}

export async function sendMessage(groupId, userId, { content, replyTo }) {
  if (!content || !content.trim()) { const e = new Error('Message cannot be empty'); e.statusCode = 400; throw e; }
  const m = await GroupMessage.create({ groupId, userId, content: content.trim().slice(0, 2000), replyTo: replyTo || undefined });
  return m;
}

export async function listMessages(groupId, { before, limit = 50 } = {}) {
  const q = { groupId, deleted: false };
  if (before) q.createdAt = { $lt: new Date(before) };
  return GroupMessage.find(q).sort({ createdAt: -1 }).limit(Math.min(limit, 100)).lean();
}

export async function editMessage(userId, id, content) {
  const m = await GroupMessage.findOne({ _id: id, userId });
  if (!m) { const e = new Error('Not found or not yours'); e.statusCode = 404; throw e; }
  m.content = content.trim().slice(0, 2000);
  m.edited = true;
  await m.save();
  return m;
}

export async function deleteMessage(userId, id) {
  const m = await GroupMessage.findOne({ _id: id, userId });
  if (!m) { const e = new Error('Not found or not yours'); e.statusCode = 404; throw e; }
  m.deleted = true;
  await m.save();
  return m;
}

export async function createInvite(groupId, invitedBy, email) {
  const code = genCode();
  return GroupInvitation.create({ groupId, invitedBy, email, code });
}

export async function members(groupId) {
  return GroupMembership.find({ groupId }).populate('userId', 'firstName lastName avatar email').lean();
}

export async function unreadCount(groupId, userId) {
  const m = await GroupMembership.findOne({ groupId, userId }).lean();
  if (!m) return 0;
  return GroupMessage.countDocuments({ groupId, deleted: false, createdAt: { $gt: m.lastReadAt }, userId: { $ne: userId } });
}

export async function markRead(groupId, userId) {
  await GroupMembership.updateOne({ groupId, userId }, { $set: { lastReadAt: new Date() } });
}
