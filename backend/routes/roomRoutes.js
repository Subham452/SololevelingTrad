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

const joinLimiter = rateLimit({ windowMs: 60e3, max: 30, standardHeaders: true, legacyHeaders: false, message: { success: false, message: 'Too many join attempts' } });

const emit = (req, event, payload, room) => {
  const io = req.app.get('io');
  if (io && room) io.to(room).emit(event, payload);
};

const permissionsSchema = z.object({
  allowScreenShare: z.boolean().optional(), allowCam: z.boolean().optional(),
  joinMuted: z.boolean().optional(), allowChat: z.boolean().optional(),
  allowRecording: z.boolean().optional(), allowInvite: z.boolean().optional(),
}).optional();

const createSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  coverImage: z.string().max(500).optional(),
  roomType: z.enum(['audio', 'video', 'meeting']).default('meeting'),
  access: z.enum(['private', 'invite', 'discoverable']).default('invite'),
  scheduledStartAt: z.string().optional(),
  scheduledEndAt: z.string().optional(),
  capacity: z.number().min(2).max(200).default(20),
  waitingRoom: z.boolean().default(false),
  requireApproval: z.boolean().default(false),
  password: z.string().min(4).max(50).optional(),
  permissions: permissionsSchema,
  cohostIds: z.array(z.string()).max(10).optional(),
  conversationId: z.string().optional(),
});

r.get('/', asyncHandler(async (req, res) => ok(res, 'OK', { items: await s.listRooms(req.user.sub, { scope: req.query.scope, q: req.query.q, limit: Number(req.query.limit) || 20 }) })));

r.post('/', validate(createSchema), asyncHandler(async (req, res) => {
  const room = await s.createRoom(req.user.sub, req.body);
  return ok(res, 'Created', { room }, 201);
}));

r.get('/:roomId', asyncHandler(async (req, res) => {
  const view = await s.roomView(req.params.roomId, req.user.sub);
  return ok(res, 'OK', view);
}));

r.patch('/:roomId', asyncHandler(async (req, res) => {
  const room = await s.updateRoom(req.user.sub, req.params.roomId, req.body || {});
  emit(req, 'room:updated', { room }, `room:${req.params.roomId}`);
  return ok(res, 'Updated', { room });
}));

r.delete('/:roomId', asyncHandler(async (req, res) => {
  await s.cancelRoom(req.user.sub, req.params.roomId);
  return ok(res, 'Cancelled');
}));

// Join returns a provider token only after app-level authorization.
r.post('/:roomId/join', joinLimiter, validate(z.object({ password: z.string().optional() })), asyncHandler(async (req, res) => {
  const result = await s.joinRoom(req.user.sub, req.params.roomId, req.body || {});
  if (result.status === 'joined') emit(req, 'room:participant-joined', { roomId: req.params.roomId, userId: req.user.sub, role: result.role }, `room:${req.params.roomId}`);
  return ok(res, 'OK', result);
}));

r.post('/:roomId/leave', asyncHandler(async (req, res) => {
  await s.leaveRoom(req.user.sub, req.params.roomId);
  emit(req, 'room:participant-left', { roomId: req.params.roomId, userId: req.user.sub }, `room:${req.params.roomId}`);
  return ok(res, 'Left');
}));

r.post('/:roomId/end', asyncHandler(async (req, res) => {
  await s.endRoom(req.user.sub, req.params.roomId);
  emit(req, 'room:ended', { roomId: req.params.roomId }, `room:${req.params.roomId}`);
  return ok(res, 'Ended');
}));

r.get('/:roomId/participants', asyncHandler(async (req, res) => ok(res, 'OK', { items: await s.roomParticipants(req.user.sub, req.params.roomId) })));

// Invitations
r.post('/:roomId/invitations', validate(z.object({
  inviteeIds: z.array(z.string()).max(50).optional(),
  expiresInHours: z.number().min(1).max(8760).optional(),
})), asyncHandler(async (req, res) => ok(res, 'Invited', await s.inviteToRoom(req.user.sub, req.params.roomId, req.body || {}), 201)));

// Join requests
r.get('/:roomId/join-requests', asyncHandler(async (req, res) => ok(res, 'OK', { items: await s.roomJoinRequests(req.user.sub, req.params.roomId) })));
r.post('/:roomId/join-requests/:requestId/approve', asyncHandler(async (req, res) => ok(res, 'OK', await s.reviewRoomJoin(req.user.sub, req.params.roomId, req.params.requestId, true))));
r.post('/:roomId/join-requests/:requestId/reject', asyncHandler(async (req, res) => ok(res, 'OK', await s.reviewRoomJoin(req.user.sub, req.params.roomId, req.params.requestId, false))));

// Invitation-token join (shareable link)
r.post('/join/:token', joinLimiter, asyncHandler(async (req, res) => {
  const room = await s.acceptRoomInvite(req.user.sub, req.params.token);
  return ok(res, 'Joined', { room });
}));

export default r;
