import Balance from '../models/Balance.js';
import Order from '../models/Order.js';
import Trade from '../models/Trade.js';
import LedgerTxn from '../models/LedgerTxn.js';
import TradingPair from '../models/TradingPair.js';
import { coinDetail } from './marketService.js';
import Notification from '../models/Notification.js';

const r8 = (n) => Math.round(Number(n) * 1e8) / 1e8;
const SEED_USDT = 100000;

export async function ensurePaperWallet(userId) {
  const n = await Balance.countDocuments({ userId });
  if (n === 0) {
    await Balance.create({ userId, asset: 'USDT', available: SEED_USDT, reserved: 0 });
    await LedgerTxn.create({ userId, asset: 'USDT', delta: SEED_USDT, balanceAfter: SEED_USDT, kind: 'seed', note: 'Paper-trading starter balance (simulated, not real money)' });
  }
}

export async function listPairs() {
  return TradingPair.find({ active: true }).lean();
}

export async function pairBySymbol(symbol) {
  const p = await TradingPair.findOne({ symbol: String(symbol).toUpperCase(), active: true }).lean();
  if (!p) { const e = new Error(`Unsupported pair: ${symbol}`); e.statusCode = 400; throw e; }
  return p;
}

// Server-authoritative price (never from client).
export async function pairPrice(pair) {
  const d = await coinDetail(pair.coinId);
  if (!d?.price) { const e = new Error('Pricing unavailable — try again'); e.statusCode = 502; throw e; }
  return d.price;
}

async function bal(userId, asset) {
  let b = await Balance.findOne({ userId, asset });
  if (!b) b = await Balance.create({ userId, asset, available: 0, reserved: 0 });
  return b;
}

async function applyDelta(userId, asset, dAvail, dRes, kind, refId, idemKey, note) {
  const b = await bal(userId, asset);
  b.available = r8(b.available + dAvail);
  b.reserved = r8(b.reserved + dRes);
  if (b.available < -1e-9 || b.reserved < -1e-9) { const e = new Error('Insufficient balance'); e.statusCode = 400; throw e; }
  await b.save();
  try {
    await LedgerTxn.create({ userId, asset, delta: r8(dAvail + dRes), balanceAfter: r8(b.available + b.reserved), kind, refId, idemKey, note });
  } catch (e) { if (e.code !== 11000) throw e; } // idempotent replay
  return b;
}

const notify = (userId, title, body) => Notification.create({ userId, title, body }).catch(() => {});

async function fillOrder(order, pair, price) {
  const fee = r8(order.qty * price * pair.feeRate);
  if (order.side === 'buy') {
    const cost = r8(order.qty * price + fee);
    // release reservation (reserved at limit) then charge actual
    if (order.reservedQuote) await applyDelta(order.userId, pair.quote, 0, -order.reservedQuote, 'release', order._id, `${order._id}:rel`);
    await applyDelta(order.userId, pair.quote, -cost, 0, 'buy', order._id, `${order._id}:pay`, `Buy ${order.qty} ${pair.base} @ ${price}`);
    await applyDelta(order.userId, pair.base, order.qty, 0, 'buy', order._id, `${order._id}:get`);
  } else {
    const proceeds = r8(order.qty * price - fee);
    await applyDelta(order.userId, pair.base, 0, -order.qty, 'release', order._id, `${order._id}:rel`);
    await applyDelta(order.userId, pair.base, -order.qty, 0, 'sell', order._id, `${order._id}:pay`);
    await applyDelta(order.userId, pair.quote, proceeds, 0, 'sell', order._id, `${order._id}:get`, `Sell ${order.qty} ${pair.base} @ ${price}`);
  }
  const trade = await Trade.create({ userId: order.userId, orderId: order._id, pair: pair.symbol, side: order.side, qty: order.qty, price, fee, mode: 'paper' });
  order.filledQty = order.qty; order.avgPrice = price; order.fee = fee;
  order.status = 'FILLED';
  await order.save();
  notify(order.userId, `Order filled (${pair.symbol})`, `${order.side.toUpperCase()} ${order.qty} @ ${price}`);
  return trade;
}

function triggerHit(order, price) {
  if (order.type === 'market') return true;
  if (order.type === 'limit') return order.side === 'buy' ? price <= order.limitPrice : price >= order.limitPrice;
  if (order.type === 'stop-loss') return order.side === 'buy' ? price >= order.stopPrice : price <= order.stopPrice;
  if (order.type === 'take-profit') return order.side === 'buy' ? price <= order.stopPrice : price >= order.stopPrice;
  return false;
}

export async function sweepOpenOrders(userId, pair, price) {
  const opens = await Order.find({ userId, pair: pair.symbol, status: { $in: ['OPEN', 'PARTIALLY_FILLED'] } });
  for (const o of opens) {
    if (!triggerHit(o, price)) continue;
    try { await fillOrder(o, pair, price); } catch { /* insufficient after reserve drift — leave open */ }
  }
}

export async function placeOrder(userId, { pair: pairSym, side, type = 'market', qty, limitPrice, stopPrice, clientOrderId }) {
  await ensurePaperWallet(userId);
  const pair = await pairBySymbol(pairSym);
  side = String(side).toLowerCase();
  if (!['buy', 'sell'].includes(side)) throw Object.assign(new Error('Invalid side'), { statusCode: 400 });
  qty = Number(qty);
  if (!Number.isFinite(qty) || qty < pair.minQty) throw Object.assign(new Error(`Minimum quantity is ${pair.minQty}`), { statusCode: 400 });
  qty = Number(qty.toFixed(pair.qtyPrecision));
  if (clientOrderId) {
    const dup = await Order.findOne({ userId, clientOrderId });
    if (dup) return { order: dup, duplicate: true };
  }
  if (!['market', 'limit', 'stop-loss', 'take-profit'].includes(type)) throw Object.assign(new Error('Invalid order type'), { statusCode: 400 });
  if (type === 'limit' && (!Number.isFinite(Number(limitPrice)) || Number(limitPrice) <= 0)) throw Object.assign(new Error('Limit price required'), { statusCode: 400 });
  if ((type === 'stop-loss' || type === 'take-profit') && (!Number.isFinite(Number(stopPrice)) || Number(stopPrice) <= 0)) throw Object.assign(new Error('Trigger price required'), { statusCode: 400 });

  const price = await pairPrice(pair);
  const order = await Order.create({
    userId, pair: pair.symbol, side, type, qty,
    limitPrice: limitPrice ? Number(limitPrice) : undefined,
    stopPrice: stopPrice ? Number(stopPrice) : undefined,
    // clientOrderId is optional for callers, but the (unique, sparse) userId+clientOrderId
    // index still treats an omitted value as null — so only one such order could ever exist
    // per user. Generate a server-side unique id when the caller doesn't supply one; supplied
    // ids keep their idempotency check above.
    status: 'PENDING', mode: 'paper',
    clientOrderId: clientOrderId || `auto-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  });

  // Reserve funds (server-computed, never client totals)
  if (side === 'buy') {
    const ref = type === 'market' ? price : type === 'limit' ? Number(limitPrice) : Number(stopPrice) * 1.02;
    const need = r8(qty * ref * (1 + pair.feeRate));
    order.reservedQuote = need;
    await order.save();
    try { await applyDelta(userId, pair.quote, -need, need, 'reserve', order._id, `${order._id}:res`, `Reserve for order`); }
    catch { order.status = 'REJECTED'; order.rejectReason = 'Insufficient balance'; await order.save(); return { order }; }
  } else {
    try { await applyDelta(userId, pair.base, -qty, qty, 'reserve', order._id, `${order._id}:res`, `Reserve for order`); }
    catch { order.status = 'REJECTED'; order.rejectReason = 'Insufficient balance'; await order.save(); return { order }; }
  }

  if (triggerHit(order, price)) {
    try { await fillOrder(order, pair, price); } catch (e) { order.status = 'REJECTED'; order.rejectReason = e.message; await order.save(); }
  } else {
    order.status = 'OPEN';
    await order.save();
  }
  // Fill any other resting orders that are now marketable
  await sweepOpenOrders(userId, pair, price);
  return { order: await Order.findById(order._id).lean() };
}

export async function cancelOrder(userId, id) {
  const o = await Order.findOne({ _id: id, userId });
  if (!o) throw Object.assign(new Error('Order not found'), { statusCode: 404 });
  if (!['OPEN', 'PARTIALLY_FILLED', 'PENDING'].includes(o.status)) throw Object.assign(new Error(`Cannot cancel ${o.status} order`), { statusCode: 400 });
  const pair = await pairBySymbol(o.pair);
  if (o.side === 'buy' && o.reservedQuote) await applyDelta(userId, pair.quote, o.reservedQuote, -o.reservedQuote, 'cancel_release', o._id, `${o._id}:cx`);
  if (o.side === 'sell') await applyDelta(userId, pair.base, o.qty, -o.qty, 'cancel_release', o._id, `${o._id}:cx`);
  o.status = 'CANCELLED';
  await o.save();
  return o.toObject();
}

// Simulated book around live mid — clearly labeled; never presented as real depth.
export async function simulatedBook(pair) {
  const mid = await pairPrice(pair);
  const bids = [], asks = [];
  for (let i = 1; i <= 12; i++) {
    const off = mid * 0.0005 * i;
    bids.push({ price: r8(mid - off), qty: r8(0.01 + Math.random() * 0.5) });
    asks.push({ price: r8(mid + off), qty: r8(0.01 + Math.random() * 0.5) });
  }
  return { pair: pair.symbol, mid, bids, asks, simulated: true, updatedAt: new Date().toISOString() };
}

export async function walletOf(userId) {
  await ensurePaperWallet(userId);
  const bals = await Balance.find({ userId }).lean();
  return { mode: 'paper', balances: bals, note: 'Simulated balances — not real money.' };
}

export async function portfolioOf(userId) {
  await ensurePaperWallet(userId);
  const bals = await Balance.find({ userId }).lean();
  const coins = await TradingPair.find({ active: true }).lean();
  const byBase = Object.fromEntries(coins.map((c) => [c.base, c]));
  // Resolve every holding's price concurrently (cached upstream, independent
  // calls) instead of awaiting each one in a serial loop.
  const priced = await Promise.all(bals.map(async (b) => {
    let price = b.asset === 'USDT' ? 1 : 0;
    if (b.asset !== 'USDT' && byBase[b.asset]) {
      try { price = await pairPrice(byBase[b.asset]); } catch { price = 0; }
    }
    return { asset: b.asset, available: b.available, reserved: b.reserved, price };
  }));
  let total = 0;
  const holdings = priced.map((h) => {
    const value = r8((h.available + h.reserved) * h.price);
    total = r8(total + value);
    return { ...h, value };
  });
  // Realized P/L is estimated client-side from recorded fills (see note below).
  return { mode: 'paper', total, holdings, note: 'Paper portfolio. P/L estimated from recorded fills.' };
}
