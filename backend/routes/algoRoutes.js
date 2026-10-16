import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../validators/validationMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import AlgoBot from '../models/AlgoBot.js';
import AlgoEvent from '../models/AlgoEvent.js';
import * as a from '../services/algoEngine.js';

const r = Router();
r.use(authenticate);

const createSchema = z.object({
  name: z.string().max(50).optional(),
  strategy: z.enum(['sma-crossover', 'rsi-reversion']),
  pair: z.string().min(3),
  coinId: z.string().min(1),
  capitalAlloc: z.number().positive().max(1e6).optional(),
  maxOrderSize: z.number().positive().max(1e5).optional(),
  maxDailyLoss: z.number().positive().optional(),
  stopLossPct: z.number().min(0.1).max(50).optional(),
  takeProfitPct: z.number().min(0.1).max(100).optional(),
  fastPeriod: z.number().int().min(2).max(200).optional(),
  slowPeriod: z.number().int().min(3).max(400).optional(),
});

r.get('/strategies', asyncHandler(async (_req, res) => ok(res, 'OK', { strategies: a.listStrategies(), mode: 'paper' })));
r.get('/bots', asyncHandler(async (req, res) => ok(res, 'OK', { bots: await AlgoBot.find({ userId: req.user.sub }).sort({ createdAt: -1 }).lean(), mode: 'paper' })));
r.post('/bots', validate(createSchema), asyncHandler(async (req, res) => ok(res, 'Bot created', { bot: await a.createBot(req.user.sub, req.body) }, 201)));
r.post('/bots/:id/start', asyncHandler(async (req, res) => ok(res, 'Started', { bot: await a.startBot(req.user.sub, req.params.id) })));
r.post('/bots/:id/pause', asyncHandler(async (req, res) => ok(res, 'Paused', { bot: await a.pauseBot(req.user.sub, req.params.id) })));
r.post('/bots/:id/stop', asyncHandler(async (req, res) => ok(res, 'Stopped', { bot: await a.stopBot(req.user.sub, req.params.id) })));
r.delete('/bots/:id', asyncHandler(async (req, res) => ok(res, 'Deleted', { bot: await a.deleteBot(req.user.sub, req.params.id) })));
r.get('/bots/:id/history', asyncHandler(async (req, res) => {
  const bot = await AlgoBot.findOne({ _id: req.params.id, userId: req.user.sub }).lean();
  if (!bot) return res.status(404).json({ success: false, message: 'Not found' });
  return ok(res, 'OK', { events: await a.botHistory(req.params.id) });
}));
r.get('/events', asyncHandler(async (req, res) => {
  const items = await AlgoEvent.find({ userId: req.user.sub }).sort({ createdAt: -1 }).limit(30).lean();
  return ok(res, 'OK', { items });
}));

export default r;
