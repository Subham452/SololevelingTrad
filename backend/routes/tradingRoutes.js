import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../validators/validationMiddleware.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { paginate } from '../utils/sanitize.js';
import Order from '../models/Order.js';
import Trade from '../models/Trade.js';
import LedgerTxn from '../models/LedgerTxn.js';
import * as eng from '../services/paperEngine.js';

const r = Router();
r.use(authenticate);

const placeSchema = z.object({
  pair: z.string().min(3).max(20),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit', 'stop-loss', 'take-profit']).default('market'),
  qty: z.number().positive().max(1e9),
  limitPrice: z.number().positive().optional(),
  stopPrice: z.number().positive().optional(),
  clientOrderId: z.string().max(64).optional(),
});

r.get('/pairs', asyncHandler(async (_req, res) => ok(res, 'OK', { pairs: await eng.listPairs(), mode: 'paper' })));

r.post('/orders', validate(placeSchema), asyncHandler(async (req, res) => {
  const { order, duplicate } = await eng.placeOrder(req.user.sub, req.body);
  return ok(res, duplicate ? 'Duplicate ignored' : 'Order processed', { order, mode: 'paper' });
}));

r.get('/orders', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const f = { userId: req.user.sub };
  if (req.query.status) f.status = req.query.status;
  if (req.query.pair) f.pair = req.query.pair;
  const [items, total] = await Promise.all([
    Order.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Order.countDocuments(f),
  ]);
  return ok(res, 'OK', { items, page, limit, total, mode: 'paper' });
}));

r.get('/orders/:id', asyncHandler(async (req, res) => {
  const o = await Order.findOne({ _id: req.params.id, userId: req.user.sub }).lean();
  if (!o) return res.status(404).json({ success: false, message: 'Not found' });
  return ok(res, 'OK', { order: o });
}));

r.delete('/orders/:id', asyncHandler(async (req, res) => ok(res, 'Cancelled', { order: await eng.cancelOrder(req.user.sub, req.params.id) })));

r.get('/trades', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const [items, total] = await Promise.all([
    Trade.find({ userId: req.user.sub }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Trade.countDocuments({ userId: req.user.sub }),
  ]);
  return ok(res, 'OK', { items, page, limit, total, mode: 'paper' });
}));

r.get('/orderbook/:pair', asyncHandler(async (req, res) => {
  const pair = await eng.pairBySymbol(req.params.pair);
  return ok(res, 'OK', await eng.simulatedBook(pair));
}));

r.get('/recent-trades/:pair', asyncHandler(async (req, res) => {
  const pair = await eng.pairBySymbol(req.params.pair);
  const items = await Trade.find({ pair: pair.symbol }).sort({ createdAt: -1 }).limit(20).lean();
  return ok(res, 'OK', { items, pair: pair.symbol, scope: 'paper-venue' });
}));

// Wallet + portfolio (paper)
r.get('/wallet', asyncHandler(async (req, res) => ok(res, 'OK', await eng.walletOf(req.user.sub))));
r.get('/wallet/transactions', asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const [items, total] = await Promise.all([
    LedgerTxn.find({ userId: req.user.sub }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    LedgerTxn.countDocuments({ userId: req.user.sub }),
  ]);
  return ok(res, 'OK', { items, page, limit, total, mode: 'paper' });
}));
r.get('/portfolio', asyncHandler(async (req, res) => ok(res, 'OK', await eng.portfolioOf(req.user.sub))));
r.get('/portfolio/history', asyncHandler(async (req, res) => {
  // Snapshots from daily trade aggregates (record-based, no invention).
  const trades = await Trade.find({ userId: req.user.sub }).sort({ createdAt: 1 }).lean();
  const byDay = {};
  for (const t of trades) {
    const d = new Date(t.createdAt).toISOString().slice(0, 10);
    (byDay[d] = byDay[d] || []).push(t);
  }
  return ok(res, 'OK', { points: Object.entries(byDay).map(([date, ts]) => ({ date, fills: ts.length })), mode: 'paper' });
}));

export default r;
