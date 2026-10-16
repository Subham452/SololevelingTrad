import { Router } from 'express';
import { z } from 'zod';
import * as c from '../controllers/announcementController.js';
import { authenticate, optionalAuth } from '../middleware/authMiddleware.js';
import { requirePerm } from '../middleware/permissions.js';
import { validate } from '../validators/validationMiddleware.js';

const r = Router();
const body = z.object({
  title: z.string().min(3).max(160), body: z.string().min(3).max(5000),
  severity: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
  audience: z.enum(['all', 'authenticated', 'staff']).default('authenticated'),
  actionUrl: z.string().max(500).optional().default(''),
  pinned: z.boolean().optional().default(false),
  status: z.enum(['draft', 'scheduled', 'published', 'archived', 'withdrawn']).default('draft'),
  publishAt: z.string().nullable().optional(), expiresAt: z.string().nullable().optional(),
});
// Public/user feed — optional auth widens audience honestly.
r.get('/', optionalAuth, c.listPublished);
r.post('/:id/read', authenticate, c.markRead);
// Admin management.
r.get('/admin/all', authenticate, requirePerm('notifications:send'), c.adminList);
r.post('/admin', authenticate, requirePerm('notifications:send'), validate(body), c.adminCreate);
r.patch('/admin/:id', authenticate, requirePerm('notifications:send'), validate(body.partial()), c.adminUpdate);
r.delete('/admin/:id', authenticate, requirePerm('notifications:send'), c.adminRemove);
export default r;
