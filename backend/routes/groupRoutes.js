import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../validators/validationMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import * as g from '../services/groupService.js';

const r = Router();
r.use(authenticate);

const createSchema = z.object({ name: z.string().min(2).max(60), description: z.string().max(300).optional(), isPublic: z.boolean().optional() });
const msgSchema = z.object({ content: z.string().min(1).max(2000), replyTo: z.string().optional() });

r.get('/', asyncHandler(async (req, res) => ok(res, 'OK', { groups: await g.listGroups(req.user.sub) })));
r.post('/', validate(createSchema), asyncHandler(async (req, res) => ok(res, 'Created', { group: await g.createGroup(req.user.sub, req.body) }, 201)));
r.post('/join', asyncHandler(async (req, res) => ok(res, 'Joined', { group: await g.joinByInvite(req.user.sub, req.body.code) })));

r.get('/:id/members', asyncHandler(async (req, res) => {
  if (!(await g.isMember(req.params.id, req.user.sub))) return res.status(403).json({ success: false, message: 'Not a member' });
  return ok(res, 'OK', { members: await g.members(req.params.id) });
}));

r.get('/:id/messages', asyncHandler(async (req, res) => {
  if (!(await g.isMember(req.params.id, req.user.sub))) return res.status(403).json({ success: false, message: 'Not a member' });
  const items = await g.listMessages(req.params.id, { before: req.query.before, limit: Number(req.query.limit) || 50 });
  return ok(res, 'OK', { items });
}));

r.post('/:id/messages', validate(msgSchema), asyncHandler(async (req, res) => {
  if (!(await g.isMember(req.params.id, req.user.sub))) return res.status(403).json({ success: false, message: 'Not a member' });
  const m = await g.sendMessage(req.params.id, req.user.sub, req.body);
  req.app.get('io')?.to(`group:${req.params.id}`).emit('group:message', { groupId: req.params.id, message: m });
  return ok(res, 'Sent', { message: m }, 201);
}));

r.patch('/messages/:id', asyncHandler(async (req, res) => ok(res, 'Updated', { message: await g.editMessage(req.user.sub, req.params.id, req.body.content) })));
r.delete('/messages/:id', asyncHandler(async (req, res) => ok(res, 'Deleted', { message: await g.deleteMessage(req.user.sub, req.params.id) })));
r.post('/:id/read', asyncHandler(async (req, res) => { await g.markRead(req.params.id, req.user.sub); return ok(res, 'Read'); }));
r.get('/:id/unread', asyncHandler(async (req, res) => ok(res, 'OK', { count: await g.unreadCount(req.params.id, req.user.sub) })));
r.post('/:id/invitations', asyncHandler(async (req, res) => ok(res, 'Invited', { invitation: await g.createInvite(req.params.id, req.user.sub, req.body.email) }, 201)));

export default r;
