import Announcement from '../models/Announcement.js';
import AnnouncementRead from '../models/AnnouncementRead.js';
import AuditLog from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';

const audit = (actorId, action, target, meta) => AuditLog.create({ actorId, action, target, meta }).catch(() => {});
const isLive = (a) => {
  const now = new Date();
  if (a.status !== 'published') return false;
  if (a.publishAt && a.publishAt > now) return false;
  if (a.expiresAt && a.expiresAt <= now) return false;
  return true;
};

// User-facing: only live announcements for audience.
export const listPublished = asyncHandler(async (req, res) => {
  const now = new Date();
  const scope = req.user ? ['all', 'authenticated'] : ['all'];
  const items = await Announcement.find({ status: 'published', audience: { $in: scope }, $and: [{ $or: [{ publishAt: null }, { publishAt: { $lte: now } }] }, { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] }] }).sort({ pinned: -1, publishAt: -1, createdAt: -1 }).limit(50).lean();
  let readIds = new Set();
  if (req.user) {
    const reads = await AnnouncementRead.find({ userId: req.user.sub, announcementId: { $in: items.map((i) => i._id) }, read: true }).lean();
    readIds = new Set(reads.map((r) => String(r.announcementId)));
  }
  return ok(res, 'OK', { items: items.map((a) => ({ ...a, live: true, read: readIds.has(String(a._id)) })), unread: items.filter((a) => !readIds.has(String(a._id))).length });
});
export const markRead = asyncHandler(async (req, res) => {
  const a = await Announcement.findById(req.params.id);
  if (!a || !isLive(a)) return res.status(404).json({ success: false, message: 'Not found' });
  await AnnouncementRead.findOneAndUpdate({ userId: req.user.sub, announcementId: a._id }, { $set: { read: true, readAt: new Date() } }, { upsert: true });
  return ok(res, 'Marked read');
});

// Admin CRUD + schedule/expire/archive/withdraw/pin.
export const adminList = asyncHandler(async (req, res) => {
  const { status, q, page = 1, limit = 20 } = req.query;
  const f = {};
  if (status) f.status = status;
  if (q) f.title = { $regex: String(q).slice(0, 80), $options: 'i' };
  const p = Math.max(1, Number(page)), l = Math.min(100, Math.max(1, Number(limit)));
  const [items, total] = await Promise.all([Announcement.find(f).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(), Announcement.countDocuments(f)]);
  return ok(res, 'OK', { items: items.map((a) => ({ ...a, live: isLive(a) })), page: p, limit: l, total });
});
const upsertBody = (b) => ({ title: b.title, body: b.body, severity: b.severity, audience: b.audience, actionUrl: b.actionUrl || '', pinned: !!b.pinned, status: b.status, publishAt: b.publishAt || null, expiresAt: b.expiresAt || null });
export const adminCreate = asyncHandler(async (req, res) => {
  const a = await Announcement.create({ ...upsertBody(req.body), createdBy: req.user.sub });
  await audit(req.user.sub, 'announcement_create', String(a._id), { title: a.title });
  return ok(res, 'Created', { announcement: a }, 201);
});
export const adminUpdate = asyncHandler(async (req, res) => {
  const a = await Announcement.findByIdAndUpdate(req.params.id, upsertBody(req.body), { new: true });
  if (!a) return res.status(404).json({ success: false, message: 'Not found' });
  await audit(req.user.sub, 'announcement_update', String(a._id), { status: a.status });
  return ok(res, 'OK', { announcement: { ...a.toObject(), live: isLive(a) } });
});
export const adminRemove = asyncHandler(async (req, res) => {
  const a = await Announcement.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
  if (!a) return res.status(404).json({ success: false, message: 'Not found' });
  await audit(req.user.sub, 'announcement_archive', String(a._id), {});
  return ok(res, 'Archived');
});
