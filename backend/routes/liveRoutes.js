import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../validators/validationMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import * as s from '../services/commService.js';

const r = Router();
r.use(authenticate);

const chatLimiter = rateLimit({ windowMs: 60e3, max: 40, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many messages' } });
const joinLimiter = rateLimit({ windowMs: 60e3, max: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many join attempts' } });

const emit = (req, event, payload, room) => {
  const io = req.app.get('io');
  if (io && room) io.to(room).emit(event, payload);
};

const createSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().max(2000).optional(),
  category: z.string().max(60).default('General'),
  coverImage: z.string().max(500).optional(),
  access: z.enum(['public', 'unlisted', 'private', 'premium']).default('public'),
  requiredPlan: z.string().max(20).nullable().optional(),
  broadcastMode: z.enum(['rtc', 'hls', 'rtmp']).default('hls'),
  scheduledStartAt: z.string().optional(),
  capacity: z.number().min(2).max(2000).default(500),
  chatEnabled: z.boolean().default(true),
  questionsEnabled: z.boolean().default(true),
  reactionsEnabled: z.boolean().default(true),
  cohostIds: z.array(z.string()).max(10).optional(),
  recordingEnabled: z.boolean().default(false),
  rtmpUrl: z.string().max(500).optional(),
});

r.get('/', asyncHandler(async (req, res) => ok(res, 'OK', { items: await s.listLive(req.user.sub, { scope: req.query.scope, q: req.query.q, category: req.query.category, limit: Number(req.query.limit) || 20 }) })));

r.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const live = await s.createLive(req.user.sub, req.body);
  emit(req, 'live:scheduled', { live }, null);
  return ok(res, 'Created', { live }, 201);
}));

r.get('/:liveId', asyncHandler(async (req, res) => {
  const view = await s.liveView(req.params.liveId, req.user.sub);
  return ok(res, 'OK', view);
}));

r.patch('/:liveId', asyncHandler(async (req, res) => {
  const live = await s.updateLive(req.user.sub, req.params.liveId, req.body || {});
  return ok(res, 'Updated', { live });
}));

r.post('/:liveId/start', asyncHandler(async (req, res) => {
  const live = await s.startLive(req.user.sub, req.params.liveId);
  emit(req, 'live:started', { live }, null);
  return ok(res, 'Live', { live });
}));

r.post('/:liveId/end', asyncHandler(async (req, res) => {
  const live = await s.endLive(req.user.sub, req.params.liveId);
  emit(req, 'live:ended', { live }, `live:${req.params.liveId}`);
  return ok(res, 'Ended', { live });
}));

r.delete('/:liveId', asyncHandler(async (req, res) => {
  await s.cancelLive(req.user.sub, req.params.liveId);
  return ok(res, 'Cancelled');
}));

r.post('/:liveId/join', joinLimiter, asyncHandler(async (req, res) => {
  const result = await s.joinLive(req.user.sub, req.params.liveId);
  if (result.status === 'joined') emit(req, 'live:participant-joined', { liveId: req.params.liveId, userId: req.user.sub }, `live:${req.params.liveId}`);
  return ok(res, 'OK', result);
}));

r.post('/:liveId/leave', asyncHandler(async (req, res) => {
  await s.leaveLive(req.user.sub, req.params.liveId);
  emit(req, 'live:participant-left', { liveId: req.params.liveId, userId: req.user.sub }, `live:${req.params.liveId}`);
  return ok(res, 'Left');
}));

r.get('/:liveId/chat', asyncHandler(async (req, res) => ok(res, 'OK', { items: await s.liveChat(req.user.sub, req.params.liveId, { before: req.query.before, limit: Number(req.query.limit) || 50 }) })));

r.post('/:liveId/chat', chatLimiter, validate(z.object({
  content: z.string().min(1).max(1000),
  type: z.enum(['message', 'question', 'announcement']).default('message'),
  clientKey: z.string().max(64).optional(),
})), asyncHandler(async (req, res) => {
  const msg = await s.sendLiveChat(req.user.sub, req.params.liveId, req.body);
  emit(req, req.body.type === 'question' ? 'live:question' : 'live:chat-message', { liveId: req.params.liveId, message: msg }, `live:${req.params.liveId}`);
  return ok(res, 'Sent', { message: msg }, 201);
}));

r.post('/:liveId/moderation', validate(z.object({
  action: z.enum(['mute', 'remove', 'ban', 'delete_message', 'pin', 'unpin']),
  targetUserId: z.string().optional(),
  messageId: z.string().optional(),
  reason: z.string().max(300).optional(),
})), asyncHandler(async (req, res) => {
  const action = await s.moderateLive(req.user.sub, req.params.liveId, req.body);
  emit(req, 'live:moderation-action', { liveId: req.params.liveId, action: req.body.action, targetUserId: req.body.targetUserId }, `live:${req.params.liveId}`);
  return ok(res, 'OK', { action });
}));

r.post('/:liveId/follow', asyncHandler(async (req, res) => ok(res, 'OK', await s.toggleFollow(req.user.sub, req.params.liveId))));

export default r;
