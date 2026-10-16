import { Router } from 'express';
import * as c from '../controllers/chatController.js';
import { authenticate } from '../middleware/authMiddleware.js';
const r = Router(); r.use(authenticate);
r.get('/sessions', c.listSessions); r.post('/sessions', c.createSession); r.get('/sessions/:id', c.getSession); r.post('/sessions/:id/messages', c.sendMessage);
export default r;