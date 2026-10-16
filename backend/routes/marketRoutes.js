import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as m from '../services/marketService.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { httpCache } from '../middleware/httpCache.js';

const r = Router();
const marketLimiter = rateLimit({ windowMs: 60e3, max: 60, standardHeaders: true, legacyHeaders: false });
r.use(marketLimiter);

r.get('/overview', httpCache(60), asyncHandler(async (_req, res) => ok(res, 'OK', await m.marketOverview())));
r.get('/coins', httpCache(30), asyncHandler(async (req, res) => {
  if (req.query.provider === 'cmc') return ok(res, 'OK', await m.cmcListings({ limit: Number(req.query.limit) || 50 }));
  return ok(res, 'OK', await m.listCoins({ page: Number(req.query.page) || 1, perPage: Number(req.query.limit) || 50, currency: req.query.currency || 'usd' }));
}));
r.get('/search', asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(400).json({ success: false, message: 'Query too short' });
  return ok(res, 'OK', await m.searchCoins(q));
}));
r.get('/coins/:id', httpCache(60), asyncHandler(async (req, res) => ok(res, 'OK', await m.coinDetail(req.params.id))));
r.get('/coins/:id/history', httpCache(60), asyncHandler(async (req, res) => {
  const range = String(req.query.range || '1M').toUpperCase();
  if (!['1D', '1W', '1M', '6M', '1Y', 'ALL'].includes(range)) return res.status(400).json({ success: false, message: 'Invalid range' });
  return ok(res, 'OK', await m.coinHistory(req.params.id, range, req.query.currency || 'usd'));
}));
r.get('/coins/:id/snapshot', asyncHandler(async (req, res) => {
  // ?date=YYYY-MM-DD (defaults to yesterday). Converted to dd-mm-yyyy for CoinGecko.
  const raw = req.query.date ? new Date(`${req.query.date}T00:00:00Z`) : new Date(Date.now() - 864e5);
  if (Number.isNaN(raw.getTime())) return res.status(400).json({ success: false, message: 'Invalid date' });
  return ok(res, 'OK', await m.coinSnapshot(req.params.id, raw));
}));
r.get('/coins/:id/ohlc', httpCache(60), asyncHandler(async (req, res) => {
  const range = String(req.query.range || '1M').toUpperCase();
  if (!['1D', '1W', '1M', '6M', '1Y', 'ALL'].includes(range)) return res.status(400).json({ success: false, message: 'Invalid range' });
  return ok(res, 'OK', await m.coinOHLC(req.params.id, range, req.query.currency || 'usd'));
}));
export default r;
