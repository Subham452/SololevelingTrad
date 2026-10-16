import AlgoBot from '../models/AlgoBot.js';
import AlgoEvent from '../models/AlgoEvent.js';
import { currentSubscription } from './subscriptionService.js';
import User from '../models/User.js';
import { coinHistory } from './marketService.js';
import { placeOrder } from './paperEngine.js';
import { logger } from '../utils/logger.js';

const logEvent = (botId, userId, type, message, meta) => AlgoEvent.create({ botId, userId, type, message, meta }).catch(() => {});

function sma(vals, n) { if (vals.length < n) return null; return vals.slice(-n).reduce((a, b) => a + b, 0) / n; }

export function checkEntitlement(userId) {
  return Promise.all([currentSubscription(userId), User.findById(userId).select('plan').lean()]).then(([s, u]) => {
    const plan = s?.plan || u?.plan || 'FREE';
    if (!['AWAKENED', 'MONARCH'].includes(String(plan).toUpperCase())) {
      const e = new Error('Algo trading requires AWAKENED or MONARCH plan');
      e.statusCode = 402; throw e;
    }
  });
}

const STRATEGY_META = {
  'sma-crossover': { name: 'SMA Crossover', desc: 'Buys when fast SMA crosses above slow SMA; sells on cross below.', risk: 'medium' },
  'rsi-reversion': { name: 'RSI Reversion', desc: 'Buys oversold (RSI<30), sells overbought (RSI>70).', risk: 'low' },
};

export function listStrategies() {
  return Object.entries(STRATEGY_META).map(([id, m]) => ({ id, ...m }));
}

export async function createBot(userId, body) {
  await checkEntitlement(userId);
  const bot = await AlgoBot.create({ userId, ...body, mode: 'paper', status: 'idle' });
  await logEvent(bot._id, userId, 'created', `Bot created: ${bot.strategy} on ${bot.pair}`);
  return bot;
}

export async function startBot(userId, id) {
  const bot = await AlgoBot.findOne({ _id: id, userId });
  if (!bot) { const e = new Error('Bot not found'); e.statusCode = 404; throw e; }
  await checkEntitlement(userId);
  if (bot.status === 'running') return bot;
  bot.status = 'running'; bot.lastError = null; await bot.save();
  await logEvent(bot._id, userId, 'started', 'Bot started');
  return bot;
}

export async function pauseBot(userId, id) {
  const bot = await AlgoBot.findOne({ _id: id, userId });
  if (!bot) { const e = new Error('Bot not found'); e.statusCode = 404; throw e; }
  bot.status = 'paused'; await bot.save();
  await logEvent(bot._id, userId, 'paused', 'Bot paused (kill switch)');
  return bot;
}

export async function stopBot(userId, id) {
  const bot = await AlgoBot.findOne({ _id: id, userId });
  if (!bot) { const e = new Error('Bot not found'); e.statusCode = 404; throw e; }
  bot.status = 'stopped'; bot.positions = []; await bot.save();
  await logEvent(bot._id, userId, 'stopped', 'Bot stopped — all positions closed');
  return bot;
}

export async function deleteBot(userId, id) {
  const bot = await AlgoBot.findOneAndDelete({ _id: id, userId });
  if (!bot) { const e = new Error('Bot not found'); e.statusCode = 404; throw e; }
  await logEvent(id, userId, 'deleted', 'Bot deleted');
  return bot;
}

// One evaluation tick. Server-side job, never a frontend timer.
export async function runTick(bot) {
  try {
    const hist = await coinHistory(bot.coinId, '1M');
    const prices = (hist?.prices || []).map(([, p]) => p);
    if (prices.length < bot.slowPeriod + 2) return;
    const cur = prices[prices.length - 1];
    const fast = sma(prices, bot.fastPeriod), slow = sma(prices, bot.slowPeriod);
    const prevFast = sma(prices.slice(0, -1), bot.fastPeriod), prevSlow = sma(prices.slice(0, -1), bot.slowPeriod);
    if (fast == null || slow == null || prevFast == null || prevSlow == null) return;
    const crossedUp = prevFast <= prevSlow && fast > slow;
    const crossedDown = prevFast >= prevSlow && fast < slow;
    const pairBase = bot.pair.split('/')[0];
    const pos = bot.positions.find((p) => p.pair === bot.pair);
    // Stop-loss / take-profit checks
    if (pos) {
      const move = ((cur - pos.entry) / pos.entry) * 100;
      if (move <= -bot.stopLossPct || move >= bot.takeProfitPct) {
        await placeOrder(bot.userId, { pair: bot.pair, side: 'sell', type: 'market', qty: pos.qty, clientOrderId: `algo-${bot._id}-sl-${Date.now()}` });
        bot.realizedPnl += (cur - pos.entry) * pos.qty;
        bot.positions = bot.positions.filter((p) => p.pair !== bot.pair);
        await logEvent(bot._id, bot.userId, 'exit', `${move <= -bot.stopLossPct ? 'Stop-loss' : 'Take-profit'} exit @ ${cur.toFixed(2)}`);
      }
    }
    // Entry
    if (!pos && crossedUp) {
      const qty = Number((bot.maxOrderSize / cur).toFixed(6));
      if (qty > 0) {
        await placeOrder(bot.userId, { pair: bot.pair, side: 'buy', type: 'market', qty, clientOrderId: `algo-${bot._id}-in-${Date.now()}` });
        bot.positions.push({ pair: bot.pair, qty, entry: cur, openedAt: new Date() });
        await logEvent(bot._id, bot.userId, 'entry', `SMA crossover entry: bought ${qty} ${pairBase} @ ${cur.toFixed(2)}`);
      }
    } else if (pos && crossedDown) {
      await placeOrder(bot.userId, { pair: bot.pair, side: 'sell', type: 'market', qty: pos.qty, clientOrderId: `algo-${bot._id}-out-${Date.now()}` });
      bot.realizedPnl += (cur - pos.entry) * pos.qty;
      bot.positions = bot.positions.filter((p) => p.pair !== bot.pair);
      await logEvent(bot._id, bot.userId, 'exit', `SMA crossover exit @ ${cur.toFixed(2)}`);
    }
    bot.lastRunAt = new Date();
    await bot.save();
  } catch (e) {
    bot.status = 'error'; bot.lastError = e.message; await bot.save();
    logger.warn(`Algo bot ${bot._id} error: ${e.message}`);
    await logEvent(bot._id, bot.userId, 'error', e.message);
  }
}

export async function runAllBots() {
  const bots = await AlgoBot.find({ status: 'running' });
  for (const b of bots) { await runTick(b); await new Promise((r) => setTimeout(r, 200)); }
  return bots.length;
}

export async function botHistory(botId) {
  return AlgoEvent.find({ botId }).sort({ createdAt: -1 }).limit(50).lean();
}
