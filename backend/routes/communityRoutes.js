import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../validators/validationMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok, fail } from '../utils/apiResponse.js';
import rateLimit from 'express-rate-limit';
import * as c from '../services/communityService.js';
import Notification from '../models/Notification.js';

const r = Router();
r.use(authenticate);

// Fan out in-app notifications for mentions and direct messages.
async function notifyMentionsAndDM(conversationId, message, senderId) {
  try {
    const conv = await (await import('../models/Community.js')).Conversation.findById(conversationId).select('type name directMembers').lean();
    if (!conv) return;
    const docs = [];
    if (conv.type === 'direct') {
      for (const uid of conv.directMembers || []) {
        if (String(uid) !== String(senderId)) {
          docs.push({ userId: uid, title: 'New message', body: (message.content || 'Attachment').slice(0, 120) });
        }
      }
    } else if (message.mentions?.length) {
      for (const uid of message.mentions) {
        if (String(uid) !== String(senderId)) {
          docs.push({ userId: uid, title: `You were mentioned in ${conv.name || 'a group'}`, body: (message.content || '').slice(0, 120) });
        }
      }
    }
    if (docs.length) await Notification.insertMany(docs);
  } catch { /* notification failure must not fail the send */ }
}

// Tighter limit for write-heavy chat actions to curb spam/abuse.
const chatLimiter = rateLimit({ windowMs: 60e3, max: 60, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many messages' } });

// --- Media uploads ----------------------------------------------------------
// Store on disk under uploads/chat with a crypto-generated filename (no client
// filename ever touches the path → no path traversal). Strict MIME + size caps.
const CHAT_DIR = path.join(process.cwd(), 'uploads', 'chat');
const ALLOWED = {
  image: { mimes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'], max: 5 * 1024 * 1024 },
  document: { mimes: ['application/pdf', 'text/plain', 'text/csv', 'application/zip'], max: 10 * 1024 * 1024 },
  audio: { mimes: ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm'], max: 5 * 1024 * 1024 },
};
const ALL_MIMES = Object.values(ALLOWED).flatMap((a) => a.mimes);

const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, f, cb) => (ALL_MIMES.includes(f.mimetype) ? cb(null, true) : cb(new Error('Unsupported file type'))),
});

function kindFor(mime) {
  for (const [kind, a] of Object.entries(ALLOWED)) if (a.mimes.includes(mime)) return kind;
  return null;
}

r.post('/upload', chatUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return fail(res, 'No file provided', 400);
  const kind = kindFor(req.file.mimetype);
  if (!kind) return fail(res, 'Unsupported file type', 415, 'UNSUPPORTED_TYPE');
  if (req.file.size > ALLOWED[kind].max) return fail(res, 'File too large', 413, 'TOO_LARGE');

  fs.mkdirSync(CHAT_DIR, { recursive: true });
  const ext = (path.extname(req.file.originalname || '').match(/^\.[a-z0-9]{1,8}$/i) || [''])[0];
  const name = `${crypto.randomBytes(16).toString('hex')}${ext}`;
  fs.writeFileSync(path.join(CHAT_DIR, name), req.file.buffer);

  return ok(res, 'Uploaded', {
    attachment: {
      kind, url: `/uploads/chat/${name}`, name: req.file.originalname || name,
      size: req.file.size, mime: req.file.mimetype,
    },
  }, 201);
}));

const emit = (req, event, payload, conversationId) => {
  const io = req.app.get('io');
  if (io && conversationId) io.to(`conv:${conversationId}`).emit(event, payload);
};

// --- Validation schemas -----------------------------------------------------
const id = z.string().min(1);
const createConvSchema = z.object({
  type: z.enum(['group', 'channel']).default('group'),
  name: z.string().min(2).max(80),
  description: z.string().max(1000).optional(),
  bio: z.string().max(300).optional(),
  avatar: z.string().max(500).optional(),
  coverImage: z.string().max(500).optional(),
  isPublic: z.boolean().optional(),
  discoverable: z.boolean().optional(),
  joinPolicy: z.enum(['open', 'invite', 'approval']).optional(),
  category: z.string().max(60).optional(),
  tags: z.array(z.string().max(30)).max(10).optional(),
  language: z.string().max(20).optional(),
  isPremium: z.boolean().optional(),
  requiredPlan: z.string().max(20).nullable().optional(),
  settings: z.object({
    whoCanSend: z.enum(['everyone', 'admins']).optional(),
    whoCanSendMedia: z.enum(['everyone', 'admins']).optional(),
    whoCanInvite: z.enum(['everyone', 'admins']).optional(),
    whoCanPin: z.enum(['everyone', 'admins']).optional(),
    whoCanManageMembers: z.enum(['everyone', 'admins']).optional(),
    membersCanInvite: z.boolean().optional(),
    requireApprovalToJoin: z.boolean().optional(),
    historyVisibleToNewMembers: z.boolean().optional(),
    slowModeSeconds: z.number().min(0).max(3600).optional(),
    linksAllowed: z.boolean().optional(),
    pollsAllowed: z.boolean().optional(),
    topicsEnabled: z.boolean().optional(),
    readOnly: z.boolean().optional(),
  }).optional(),
});

const attachmentSchema = z.object({
  kind: z.enum(['image', 'document', 'audio']),
  url: z.string().max(1000), name: z.string().max(200).optional(),
  size: z.number().optional(), mime: z.string().max(100).optional(),
  width: z.number().optional(), height: z.number().optional(),
});

const tradeIdeaSchema = z.object({
  symbol: z.string().max(20), entry: z.number().optional(), stopLoss: z.number().optional(),
  target: z.number().optional(), bias: z.enum(['long', 'short', 'neutral']).optional(), note: z.string().max(500).optional(),
});

const sendSchema = z.object({
  content: z.string().max(4000).optional(),
  type: z.enum(['text', 'image', 'document', 'audio', 'trade_idea']).optional(),
  attachments: z.array(attachmentSchema).max(10).optional(),
  replyTo: id.optional(),
  clientKey: z.string().max(64).optional(),
  tradeIdea: tradeIdeaSchema.optional(),
});

// ============================================================================
// Conversations (inbox + DMs)
// ============================================================================

r.get('/conversations', asyncHandler(async (req, res) => {
  const items = await c.listConversations(req.user.sub, { filter: req.query.filter, limit: Number(req.query.limit) || 50 });
  return ok(res, 'OK', { items });
}));

r.post('/conversations/direct', validate(z.object({ userId: id })), asyncHandler(async (req, res) => {
  const conv = await c.createDirect(req.user.sub, req.body.userId);
  return ok(res, 'OK', { conversation: conv }, 201);
}));

r.get('/conversations/:id', asyncHandler(async (req, res) => {
  const profile = await c.conversationProfile(req.params.id, req.user.sub);
  return ok(res, 'OK', profile);
}));

r.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
  const items = await c.listMessages(req.params.id, req.user.sub, { before: req.query.before, limit: Number(req.query.limit) || 50, topicId: req.query.topicId });
  return ok(res, 'OK', { items });
}));

r.post('/conversations/:id/messages', chatLimiter, validate(sendSchema), asyncHandler(async (req, res) => {
  const message = await c.sendMessage(req.params.id, req.user.sub, req.body);
  emit(req, 'message:new', { conversationId: req.params.id, message }, req.params.id);
  notifyMentionsAndDM(req.params.id, message, req.user.sub);
  return ok(res, 'Sent', { message }, 201);
}));

r.post('/conversations/:id/read', validate(z.object({ messageId: id.optional() })), asyncHandler(async (req, res) => {
  await c.markRead(req.params.id, req.user.sub, req.body?.messageId);
  emit(req, 'conversation:read', { conversationId: req.params.id, userId: req.user.sub }, req.params.id);
  return ok(res, 'Read');
}));

r.get('/conversations/:id/search', asyncHandler(async (req, res) => {
  const items = await c.searchMessages(req.params.id, req.user.sub, { q: req.query.q, limit: Number(req.query.limit) || 30 });
  return ok(res, 'OK', { items });
}));

r.get('/conversations/:id/pinned', asyncHandler(async (req, res) => ok(res, 'OK', { items: await c.listPinned(req.params.id, req.user.sub) })));

r.get('/conversations/:id/members', asyncHandler(async (req, res) => {
  const items = await c.listMembers(req.params.id, req.user.sub, { limit: Number(req.query.limit) || 50, skip: Number(req.query.skip) || 0, q: req.query.q });
  return ok(res, 'OK', { items });
}));

r.get('/conversations/:id/topics', asyncHandler(async (req, res) => ok(res, 'OK', { items: await c.listTopics(req.params.id, req.user.sub) })));
r.post('/conversations/:id/topics', validate(z.object({ name: z.string().min(2).max(60), description: z.string().max(300).optional(), icon: z.string().max(10).optional(), order: z.number().optional() })), asyncHandler(async (req, res) => ok(res, 'Created', { topic: await c.createTopic(req.params.id, req.user.sub, req.body) }, 201)));

// ============================================================================
// Groups / channels — lifecycle
// ============================================================================

r.post('/conversations', chatLimiter, validate(createConvSchema), asyncHandler(async (req, res) => {
  const conv = await c.createConversation(req.user.sub, req.body);
  return ok(res, 'Created', { conversation: conv }, 201);
}));

r.patch('/conversations/:id', asyncHandler(async (req, res) => {
  const conv = await c.updateConversation(req.params.id, req.user.sub, req.body);
  emit(req, 'conversation:updated', { conversationId: req.params.id, conversation: conv }, req.params.id);
  return ok(res, 'Updated', { conversation: conv });
}));

r.post('/conversations/:id/join', asyncHandler(async (req, res) => {
  const result = await c.joinConversation(req.user.sub, req.params.id, { inviteToken: req.body?.token });
  if (result.status === 'joined') emit(req, 'member:joined', { conversationId: req.params.id, userId: req.user.sub }, req.params.id);
  return ok(res, 'OK', result);
}));

r.post('/conversations/:id/leave', asyncHandler(async (req, res) => {
  await c.leaveConversation(req.user.sub, req.params.id);
  emit(req, 'member:left', { conversationId: req.params.id, userId: req.user.sub }, req.params.id);
  return ok(res, 'Left');
}));

// ============================================================================
// Membership & moderation
// ============================================================================

r.patch('/conversations/:id/members/:userId', asyncHandler(async (req, res) => {
  const member = await c.updateMember(req.params.id, req.user.sub, req.params.userId, req.body || {});
  emit(req, 'member:updated', { conversationId: req.params.id, member }, req.params.id);
  return ok(res, 'Updated', { member });
}));

r.delete('/conversations/:id/members/:userId', asyncHandler(async (req, res) => {
  await c.removeMember(req.params.id, req.user.sub, req.params.userId);
  emit(req, 'member:removed', { conversationId: req.params.id, userId: req.params.userId }, req.params.id);
  return ok(res, 'Removed');
}));

r.post('/conversations/:id/ban/:userId', asyncHandler(async (req, res) => {
  const result = await c.banMember(req.params.id, req.user.sub, req.params.userId, true);
  emit(req, 'member:banned', { conversationId: req.params.id, userId: req.params.userId }, req.params.id);
  return ok(res, 'Banned', result);
}));

r.delete('/conversations/:id/ban/:userId', asyncHandler(async (req, res) => {
  const result = await c.banMember(req.params.id, req.user.sub, req.params.userId, false);
  return ok(res, 'Unbanned', result);
}));

// ============================================================================
// Join requests
// ============================================================================

r.post('/conversations/:id/join-requests', chatLimiter, validate(z.object({ message: z.string().max(300).optional() })), asyncHandler(async (req, res) => {
  const request = await c.createJoinRequest(req.user.sub, req.params.id, req.body?.message);
  return ok(res, 'Requested', { request }, 201);
}));

r.get('/conversations/:id/join-requests', asyncHandler(async (req, res) => ok(res, 'OK', { items: await c.listJoinRequests(req.params.id, req.user.sub) })));

r.patch('/conversations/:id/join-requests/:requestId', validate(z.object({ approve: z.boolean() })), asyncHandler(async (req, res) => {
  const result = await c.reviewJoinRequest(req.params.id, req.user.sub, req.params.requestId, req.body.approve);
  return ok(res, 'OK', result);
}));

// ============================================================================
// Invites
// ============================================================================

r.post('/conversations/:id/invites', validate(z.object({ expiresHours: z.number().min(1).max(8760).optional(), maxUses: z.number().min(1).max(10000).optional(), requireApproval: z.boolean().optional() })), asyncHandler(async (req, res) => {
  const { token, invite } = await c.createInvite(req.params.id, req.user.sub, req.body || {});
  return ok(res, 'Created', { token, invite, url: `${process.env.CLIENT_URL || ''}/community/invite/${token}` }, 201);
}));

r.get('/conversations/:id/invites', asyncHandler(async (req, res) => ok(res, 'OK', { items: await c.listInvites(req.params.id, req.user.sub) })));
r.delete('/conversations/:id/invites/:inviteId', asyncHandler(async (req, res) => ok(res, 'Revoked', await c.revokeInvite(req.params.id, req.user.sub, req.params.inviteId))));

r.get('/invites/:token', asyncHandler(async (req, res) => ok(res, 'OK', await c.peekInvite(req.params.token))));
r.post('/invites/:token/join', asyncHandler(async (req, res) => {
  const result = await c.joinByInvite(req.user.sub, req.params.token);
  return ok(res, 'OK', result);
}));

// ============================================================================
// Messages — edit / delete / react / pin
// ============================================================================

r.patch('/messages/:id', validate(z.object({ content: z.string().min(1).max(4000) })), asyncHandler(async (req, res) => {
  const message = await c.editMessage(req.user.sub, req.params.id, req.body.content);
  emit(req, 'message:updated', { conversationId: String(message.conversationId), message }, message.conversationId);
  return ok(res, 'Updated', { message });
}));

r.delete('/messages/:id', asyncHandler(async (req, res) => {
  const forMe = req.query.forMe === 'true';
  const message = await c.deleteMessage(req.user.sub, req.params.id, { forMe });
  if (!forMe) emit(req, 'message:deleted', { conversationId: String(message.conversationId), messageId: req.params.id }, message.conversationId);
  return ok(res, 'Deleted', { message });
}));

r.post('/messages/:id/reactions', validate(z.object({ emoji: z.string().min(1).max(8) })), asyncHandler(async (req, res) => {
  const message = await c.reactToMessage(req.user.sub, req.params.id, req.body.emoji);
  emit(req, 'message:reaction', { conversationId: String(message.conversationId), message }, message.conversationId);
  return ok(res, 'OK', { message });
}));

r.post('/messages/:id/pin', asyncHandler(async (req, res) => {
  const message = await c.setPinned(req.user.sub, req.params.id, true);
  emit(req, 'message:pinned', { conversationId: String(message.conversationId), message }, message.conversationId);
  return ok(res, 'Pinned', { message });
}));

r.delete('/messages/:id/pin', asyncHandler(async (req, res) => {
  const message = await c.setPinned(req.user.sub, req.params.id, false);
  emit(req, 'message:unpinned', { conversationId: String(message.conversationId), message }, message.conversationId);
  return ok(res, 'Unpinned', { message });
}));

// ============================================================================
// Discovery & misc
// ============================================================================

r.get('/discover', asyncHandler(async (req, res) => {
  const items = await c.discover(req.user.sub, { q: req.query.q, category: req.query.category, limit: Number(req.query.limit) || 20 });
  return ok(res, 'OK', { items });
}));

r.get('/categories', asyncHandler(async (_req, res) => ok(res, 'OK', { items: await c.categories() })));
r.get('/users/search', asyncHandler(async (req, res) => ok(res, 'OK', { items: await c.searchUsers(req.user.sub, { q: req.query.q, limit: Number(req.query.limit) || 10 }) })));

r.post('/reports', chatLimiter, validate(z.object({
  targetType: z.enum(['user', 'message', 'conversation']), targetId: id,
  reason: z.enum(['spam', 'scam', 'harassment', 'illegal', 'impersonation', 'other']), details: z.string().max(1000).optional(),
})), asyncHandler(async (req, res) => ok(res, 'Reported', { report: await c.createReport(req.user.sub, req.body) }, 201)));

// ============================================================================
// Notifications (reuses existing Notification model)
// ============================================================================

r.get('/notifications', asyncHandler(async (req, res) => {
  const items = await Notification.find({ userId: req.user.sub }).sort({ createdAt: -1 }).limit(50).lean();
  const unread = await Notification.countDocuments({ userId: req.user.sub, read: false });
  return ok(res, 'OK', { items, unread });
}));

r.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, userId: req.user.sub }, { $set: { read: true } });
  return ok(res, 'Read');
}));

r.post('/notifications/read-all', asyncHandler(async (req, res) => {
  await Notification.updateMany({ userId: req.user.sub, read: false }, { $set: { read: true } });
  return ok(res, 'Read');
}));

export default r;
