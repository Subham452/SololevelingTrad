import User from '../models/User.js';
import Payment from '../models/Payment.js';
import Session from '../models/Session.js';
import Subscription from '../models/Subscription.js';
import ActivityLog from '../models/ActivityLog.js';
import AuditLog from '../models/AuditLog.js';
import Notification from '../models/Notification.js';
import { Call, LiveSession, ModerationAction, LiveChatMessage } from '../models/Comms.js';
import { CommunityReport } from '../models/Community.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { paginate } from '../utils/sanitize.js';
import { can } from '../middleware/permissions.js';
import { revenueByMonth, registrationsByDay, dauMau, paymentSuccessRate } from '../services/analyticsService.js';
import * as admin from '../services/adminService.js';
import { refund as providerRefund } from '../services/paymentService.js';
export const dashboard = asyncHandler(async (req, res) => {
  const [users, revenue, active] = await Promise.all([User.countDocuments(), Payment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, t: { $sum: '$amount' } } }]), Subscription.countDocuments({ status: 'active' })]);
  return ok(res, 'OK', { users, revenue: revenue[0]?.t || 0, activeSubscriptions: active });
});
export const stats = dashboard;
export const listUsers = asyncHandler(async (req, res) => { const { page, limit, skip } = paginate(req.query); const [items, total] = await Promise.all([User.find().sort({ createdAt: -1 }).skip(skip).limit(limit), User.countDocuments()]); return ok(res, 'OK', { items, page, limit, total }); });
export const getUser = asyncHandler(async (req, res) => { const u = await User.findById(req.params.id); if (!u) return res.status(404).json({ success: false, message: 'Not found' }); return ok(res, 'OK', { user: u }); });
export const updateUser = asyncHandler(async (req, res) => {
  // Whitelist-only update: forwarding req.body verbatim would let a caller set
  // role/status/passwordHash. See adminService.userUpdatePatch.
  const patch = admin.userUpdatePatch(req.body);
  const u = await User.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
  if (!u) return res.status(404).json({ success: false, message: 'Not found' });
  await AuditLog.create({ actorId: req.user.sub, action: 'update_user', target: req.params.id, meta: { fields: Object.keys(patch) } });
  return ok(res, 'Updated', { user: u });
});
export const moderateUser = asyncHandler(async (req, res) => { const { status } = req.body; const u = await User.findByIdAndUpdate(req.params.id, { status }, { new: true }); await AuditLog.create({ actorId: req.user.sub, action: `user_${status}`, target: req.params.id }); return ok(res, `User ${status}`, { user: u }); });
export const setRole = asyncHandler(async (req, res) => { const u = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }); await AuditLog.create({ actorId: req.user.sub, action: 'set_role', target: req.params.id, meta: req.body }); return ok(res, 'Role updated', { user: u }); });
export const deleteUser = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) return res.status(404).json({ success: false, message: 'Not found' });
  u.email = `deleted_${u._id}@deleted.local`; u.firebaseUid = undefined; u.firstName = 'Deleted'; u.lastName = 'User'; u.username = undefined; u.avatar = undefined; u.phone = undefined; u.status = 'inactive';
  await u.save();
  await Session.updateMany({ userId: u._id }, { $set: { revoked: true } });
  await AuditLog.create({ actorId: req.user.sub, action: 'delete_user', target: req.params.id });
  return ok(res, 'User anonymized, sessions revoked. Transaction records preserved.');
});
export const userAction = asyncHandler(async (req, res) => {
  const { id, action } = req.params;
  const u = await User.findById(id);
  if (!u) return res.status(404).json({ success: false, message: 'Not found' });
  let msg = '';
  if (['suspend', 'activate', 'ban'].includes(action)) {
    u.status = action === 'activate' ? 'active' : action === 'suspend' ? 'suspended' : 'banned';
    await u.save(); msg = `User ${u.status}`;
  } else if (action === 'role') {
    // Defense-in-depth: role assignment is a superadmin-only capability
    // (roles:write). Never trust the client-supplied role, and never allow a
    // non-superadmin to mint a superadmin.
    const role = String(req.body.role || '');
    if (!['user', 'support', 'admin', 'superadmin', 'finance', 'analyst'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    if (!can(req.user.role, 'roles:write')) {
      return res.status(403).json({ success: false, message: 'Forbidden: requires roles:write' });
    }
    u.role = role; await u.save(); msg = `Role set to ${u.role}`;
  } else if (action === 'revoke') {
    await Session.updateMany({ userId: u._id }, { $set: { revoked: true } }); msg = 'All sessions revoked';
  } else if (action === 'extend') {
    const days = Math.min(Math.max(Number(req.body.days) || 30, 1), 365);
    // Extend the ACTIVE subscription's expiry (the authoritative entitlement
    // field) — there is no `currentPeriodEnd` on the Subscription schema.
    const sub = await Subscription.findOne({ userId: u._id, status: 'active' }).sort({ createdAt: -1 });
    const base = sub?.expiresAt && sub.expiresAt > new Date() ? sub.expiresAt : new Date();
    const until = new Date(base.getTime() + days * 864e5);
    if (sub) { sub.expiresAt = until; await sub.save(); }
    u.subscriptionExpiresAt = until; await u.save(); msg = `Subscription extended to ${until.toISOString().slice(0, 10)}`;
  } else {
    return res.status(400).json({ success: false, message: 'Unknown action' });
  }
  await AuditLog.create({ actorId: req.user.sub, action: `user_${action}`, target: id, meta: req.body });
  await ActivityLog.create({ userId: u._id, action: `admin_${action}`, meta: { by: req.user.sub } });
  return ok(res, msg, { user: u });
});
export const activity = asyncHandler(async (req, res) => { const { page, limit, skip } = paginate(req.query); const [items, total] = await Promise.all([ActivityLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit), ActivityLog.countDocuments()]); return ok(res, 'OK', { items, page, limit, total }); });
export const auditLogs = asyncHandler(async (req, res) => { const { page, limit, skip } = paginate(req.query); const [items, total] = await Promise.all([AuditLog.find().sort({ createdAt: -1 }).skip(skip).limit(limit), AuditLog.countDocuments()]); return ok(res, 'OK', { items, page, limit, total }); });
export const payments = asyncHandler(async (req, res) => { const { page, limit, skip } = paginate(req.query); const [items, total] = await Promise.all([Payment.find().sort({ createdAt: -1 }).skip(skip).limit(limit), Payment.countDocuments()]); return ok(res, 'OK', { items, page, limit, total }); });
export const subscriptions = asyncHandler(async (req, res) => { const { page, limit, skip } = paginate(req.query); const [items, total] = await Promise.all([Subscription.find().sort({ createdAt: -1 }).skip(skip).limit(limit), Subscription.countDocuments()]); return ok(res, 'OK', { items, page, limit, total }); });
export const revenue = asyncHandler(async (req, res) => { const data = await revenueByMonth(); return ok(res, 'OK', { revenue: data }); });
export const analytics = asyncHandler(async (req, res) => {
  const [rev, regs, dau, pay] = await Promise.all([revenueByMonth(), registrationsByDay(), dauMau(), paymentSuccessRate()]);
  const byPlan = await User.aggregate([{ $group: { _id: '$plan', count: { $sum: 1 } } }]);
  const byStatus = await User.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]);
  const byProvider = await User.aggregate([{ $group: { _id: '$authProvider', count: { $sum: 1 } } }]);
  return ok(res, 'OK', { revenueByMonth: rev, registrationsByDay: regs, dauMau: dau, paymentSuccessRate: pay, byPlan, byStatus, byProvider });
});
export const sendNotification = asyncHandler(async (req, res) => {
  const { userIds, title, body } = req.body;
  const docs = await Notification.insertMany((userIds || []).map(u => ({ userId: u, title, body })));
  await AuditLog.create({ actorId: req.user.sub, action: 'send_notification', meta: { count: docs.length } });
  return ok(res, 'Sent', { count: docs.length }, 201);
});

// ===========================================================================
// Phase 13 — Enterprise admin surface. All figures below come from real
// collections; there is deliberately no demo/mock fallback.
// ===========================================================================

// --- Executive overview ----------------------------------------------------
export const overview = asyncHandler(async (req, res) => {
  const data = await admin.overview({ from: req.query.from, to: req.query.to });
  return ok(res, 'OK', data);
});

// --- Users: server-side search / filter / sort / pagination ----------------
export const searchUsers = asyncHandler(async (req, res) => {
  const data = await admin.listUsers(req.query);
  return ok(res, 'OK', data);
});

export const userDetail = asyncHandler(async (req, res) => {
  const data = await admin.userDetail(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'User not found' });
  return ok(res, 'OK', data);
});

// Suspend/ban capture an optional reason so moderation stays accountable in
// the audit log (reason optional to preserve the existing API contract).
export const moderateUserV2 = asyncHandler(async (req, res) => {
  const { status, reason = '' } = req.body;
  if (!['active', 'inactive', 'suspended', 'banned'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }
  const u = await User.findByIdAndUpdate(req.params.id, { status }, { new: true });
  if (!u) return res.status(404).json({ success: false, message: 'User not found' });
  if (status === 'banned' || status === 'suspended') {
    await Session.updateMany({ userId: u._id }, { $set: { revoked: true } });
  }
  await AuditLog.create({ actorId: req.user.sub, action: `user_${status}`, target: req.params.id, meta: { reason } });
  await ActivityLog.create({ userId: u._id, action: `admin_${status}`, meta: { by: req.user.sub, reason } });
  return ok(res, `User ${status}`, { user: u });
});

// --- Transactions ----------------------------------------------------------
export const searchTransactions = asyncHandler(async (req, res) => {
  const data = await admin.listPayments(req.query);
  return ok(res, 'OK', data);
});

// --- Unified checkout orders (admin) ---------------------------------------
export const searchOrders = asyncHandler(async (req, res) => {
  const data = await admin.listCheckoutOrders(req.query);
  return ok(res, 'OK', data);
});

export const orderDetail = asyncHandler(async (req, res) => {
  const data = await admin.checkoutOrderDetail(req.params.id);
  if (!data) return res.status(404).json({ success: false, message: 'Order not found' });
  return ok(res, 'OK', data);
});

// Provider configuration status: presence + mode + warnings. Secret values are
// never included in the response.
export const paymentConfig = asyncHandler(async (req, res) => {
  return ok(res, 'OK', await admin.providerConfigStatus());
});

// Real provider refund. Idempotent: an already-refunded payment short-circuits
// without hitting the provider again, and Payment.status only flips to
// 'refunded' after the provider confirms. No simulated success paths.
export const refundPayment = asyncHandler(async (req, res) => {
  const p = await Payment.findById(req.params.id);
  if (!p) return res.status(404).json({ success: false, message: 'Payment not found' });
  if (p.status === 'refunded') return ok(res, 'Already refunded', { payment: p, idempotent: true });
  if (p.status !== 'paid') {
    return res.status(409).json({ success: false, message: `Cannot refund a payment in status '${p.status}'` });
  }
  if (!p.providerPaymentId) {
    return res.status(400).json({ success: false, message: 'No provider payment id recorded for this payment' });
  }
  let result;
  try {
    result = await providerRefund(p.provider, p.providerPaymentId, p.amount);
  } catch (e) {
    await AuditLog.create({
      actorId: req.user.sub, action: 'refund_failed', target: String(p._id),
      meta: { provider: p.provider, amount: p.amount, error: String(e?.message || e) },
    });
    return res.status(502).json({
      success: false,
      message: `Refund failed at ${p.provider}: ${e?.message || 'provider error'}. Payment status unchanged.`,
    });
  }
  p.status = 'refunded';
  await p.save();
  await AuditLog.create({
    actorId: req.user.sub, action: 'refund_payment', target: String(p._id),
    meta: { provider: p.provider, amount: p.amount, providerRefundId: result?.id || null },
  });
  await ActivityLog.create({ userId: p.userId, action: 'admin_refund', meta: { amount: p.amount, by: req.user.sub } });
  return ok(res, 'Refunded', { payment: p, providerResult: { id: result?.id || null, status: result?.status || null } });
});

// --- Subscriptions & revenue analytics -------------------------------------
export const subscriptionStats = asyncHandler(async (req, res) => {
  const data = await admin.subscriptionAnalytics({ from: req.query.from, to: req.query.to });
  return ok(res, 'OK', data);
});
export const searchSubscriptions = asyncHandler(async (req, res) => {
  const data = await admin.listSubscriptions(req.query);
  return ok(res, 'OK', data);
});

// --- Activity / audit with filters -----------------------------------------
export const searchActivity = asyncHandler(async (req, res) => ok(res, 'OK', await admin.listActivity(req.query)));
export const searchAudit = asyncHandler(async (req, res) => ok(res, 'OK', await admin.listAudit(req.query)));

// --- Security --------------------------------------------------------------
export const security = asyncHandler(async (req, res) => {
  const data = await admin.securityOverview({ from: req.query.from, to: req.query.to });
  return ok(res, 'OK', data);
});

// --- Health ----------------------------------------------------------------
export const health = asyncHandler(async (_req, res) => ok(res, 'OK', await admin.health()));

// --- Messaging: admin ↔ user threads ---------------------------------------
export const messagesConversations = asyncHandler(async (req, res) => ok(res, 'OK', await admin.listConversations(req.query)));
export const messagesThread = asyncHandler(async (req, res) => {
  const items = await admin.threadMessages(req.params.id, req.query);
  return ok(res, 'OK', { items });
});
export const messagesSend = asyncHandler(async (req, res) => {
  const { conversation, message } = await admin.sendAdminMessage(req.user.sub, {
    userId: req.body.userId, conversationId: req.body.conversationId, content: req.body.content,
  });
  await AuditLog.create({ actorId: req.user.sub, action: 'send_support_message', target: String(conversation._id) });
  return ok(res, 'Sent', { conversation, message }, 201);
});

// --- Calls & live sessions -------------------------------------------------
export const callsList = asyncHandler(async (req, res) => {
  const { status, type, from, to, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (type) filter.type = type;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const [total, items] = await Promise.all([
    Call.countDocuments(filter),
    Call.find(filter).populate('initiatorId', 'email firstName lastName')
      .sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
  ]);
  return ok(res, 'OK', { items, total, page: p, pages: Math.max(1, Math.ceil(total / l)), limit: l });
});

// Admin support call invitation: find-or-create the DM with the target user
// and start a real call through commService (VideoSDK). The user receives the
// standard call:incoming socket event and must accept/decline — nothing fake.
export const callsInvite = asyncHandler(async (req, res) => {
  const { userId, type = 'video' } = req.body;
  if (!userId) return res.status(400).json({ success: false, message: 'userId required' });
  const target = await User.findById(userId);
  if (!target) return res.status(404).json({ success: false, message: 'User not found' });
  if (target.status === 'banned') return res.status(409).json({ success: false, message: 'Cannot call a banned user' });
  const conversation = await admin.findOrCreateDm(req.user.sub, userId);
  const comm = await import('../services/commService.js');
  const call = await comm.createCall(req.user.sub, { conversationId: String(conversation._id), type });
  await AuditLog.create({ actorId: req.user.sub, action: 'call_invite', target: userId, meta: { callId: String(call?._id || call?.call?._id || ''), type } });
  return ok(res, 'Call invitation sent', { call }, 201);
});

export const livesList = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 25 } = req.query;
  const filter = status ? { status } : {};
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const [total, items] = await Promise.all([
    LiveSession.countDocuments(filter),
    LiveSession.find(filter).populate('hostId', 'email firstName lastName')
      .sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
  ]);
  return ok(res, 'OK', { items, total, page: p, pages: Math.max(1, Math.ceil(total / l)), limit: l });
});

// Force-end a live session as an admin (platform-level moderation). Deactivates
// the provider room best-effort and records a ModerationAction.
export const endLiveSession = asyncHandler(async (req, res) => {
  const live = await LiveSession.findById(req.params.id);
  if (!live) return res.status(404).json({ success: false, message: 'Session not found' });
  if (live.status !== 'live') return res.status(409).json({ success: false, message: `Session is '${live.status}', not live` });
  live.status = 'ended'; live.endedAt = new Date(); live.viewerCount = 0;
  await live.save();
  try {
    if (live.providerRoomId) {
      const { deactivateRoom } = await import('../services/videoSdkService.js');
      await deactivateRoom(live.providerRoomId);
    }
  } catch { /* best-effort */ }
  await ModerationAction.create({
    actorId: req.user.sub, targetType: 'live', targetId: live._id,
    action: 'end', reason: String(req.body.reason || 'Ended by admin').slice(0, 300),
  });
  await AuditLog.create({ actorId: req.user.sub, action: 'end_live_session', target: String(live._id), meta: { reason: req.body.reason || '' } });
  return ok(res, 'Session ended', { live });
});

// --- Moderation ------------------------------------------------------------
export const reportsList = asyncHandler(async (req, res) => {
  const { status, targetType, page = 1, limit = 25 } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (targetType) filter.targetType = targetType;
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const [total, items] = await Promise.all([
    CommunityReport.countDocuments(filter),
    CommunityReport.find(filter).populate('reporterId', 'email')
      .sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
  ]);
  return ok(res, 'OK', { items, total, page: p, pages: Math.max(1, Math.ceil(total / l)), limit: l });
});

export const reportResolve = asyncHandler(async (req, res) => {
  const { status, actionTaken = '' } = req.body;
  if (!['reviewing', 'resolved', 'dismissed'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }
  const report = await CommunityReport.findByIdAndUpdate(
    req.params.id, { status, actionTaken, moderatorId: req.user.sub }, { new: true },
  );
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
  if (report.targetType === 'user' || report.targetType === 'message') {
    await ModerationAction.create({
      actorId: req.user.sub,
      targetType: report.targetType, targetId: report.targetId,
      action: status === 'dismissed' ? 'unmute' : 'delete_message',
      reason: String(actionTaken).slice(0, 300),
    }).catch(() => { /* moderation log is best-effort */ });
  }
  await AuditLog.create({ actorId: req.user.sub, action: `report_${status}`, target: String(report._id), meta: { actionTaken } });
  return ok(res, `Report ${status}`, { report });
});

// Remove a live-chat message (soft-hide) and record the moderation action.
export const hideChatMessage = asyncHandler(async (req, res) => {
  const msg = await LiveChatMessage.findById(req.params.id);
  if (!msg) return res.status(404).json({ success: false, message: 'Message not found' });
  msg.deletedAt = new Date(); await msg.save();
  await ModerationAction.create({
    actorId: req.user.sub, targetType: 'message', targetId: msg._id,
    action: 'delete_message', reason: String(req.body.reason || '').slice(0, 300),
  });
  await AuditLog.create({ actorId: req.user.sub, action: 'hide_message', target: String(msg._id), meta: { reason: req.body.reason || '' } });
  const io = req.app.get('io');
  if (io && msg.liveId) io.to(`live:${msg.liveId}`).emit('live:message-hidden', { messageId: String(msg._id) });
  return ok(res, 'Message hidden', { messageId: msg._id });
});
