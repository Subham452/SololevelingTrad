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

// Throttle call creation to prevent spam-dialing.
const callLimiter = rateLimit({ windowMs: 60e3, max: 20, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many call attempts' } });

const emit = (req, event, payload, room) => {
  const io = req.app.get('io');
  if (io && room) io.to(room).emit(event, payload);
};

// POST /api/calls — start a 1:1 call in a direct conversation
r.post('/', callLimiter, validate(z.object({
  conversationId: z.string().min(1),
  type: z.enum(['audio', 'video']).default('video'),
})), asyncHandler(async (req, res) => {
  const call = await s.createCall(req.user.sub, req.body);
  // Signal the recipient (they listen on their personal user room).
  emit(req, 'call:incoming', { call }, `user:${call.participantIds.find((p) => String(p) !== String(req.user.sub))}`);
  return ok(res, 'Ringing', { call }, 201);
}));

r.post('/:callId/accept', asyncHandler(async (req, res) => {
  const call = await s.acceptCall(req.user.sub, req.params.callId);
  emit(req, 'call:accepted', { call }, `conv:${call.conversationId}`);
  return ok(res, 'Accepted', { call });
}));

r.post('/:callId/reject', asyncHandler(async (req, res) => {
  const call = await s.rejectCall(req.user.sub, req.params.callId);
  emit(req, 'call:rejected', { call }, `user:${call.initiatorId}`);
  return ok(res, 'Rejected', { call });
}));

r.post('/:callId/cancel', asyncHandler(async (req, res) => {
  const call = await s.cancelCall(req.user.sub, req.params.callId);
  emit(req, 'call:cancelled', { call }, `conv:${call.conversationId}`);
  return ok(res, 'Cancelled', { call });
}));

r.post('/:callId/end', asyncHandler(async (req, res) => {
  const call = await s.endCall(req.user.sub, req.params.callId);
  emit(req, 'call:ended', { call }, `conv:${call.conversationId}`);
  return ok(res, 'Ended', { call });
}));

// Mint a scoped provider token for an accepted call (authorized server-side).
r.get('/:callId/token', asyncHandler(async (req, res) => ok(res, 'OK', await s.callToken(req.user.sub, req.params.callId))));

r.get('/history', asyncHandler(async (req, res) => ok(res, 'OK', { items: await s.callHistory(req.user.sub, { limit: Number(req.query.limit) || 30 }) })));
r.get('/:callId', asyncHandler(async (req, res) => ok(res, 'OK', { call: await s.getCall(req.user.sub, req.params.callId) })));

export default r;
