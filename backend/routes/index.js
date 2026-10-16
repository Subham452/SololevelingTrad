import { Router } from 'express';
import auth from './authRoutes.js'; import users from './userRoutes.js';
import subs from './subscriptionRoutes.js'; import pay from './paymentRoutes.js';
import webhooks from './webhookRoutes.js'; import admin from './adminRoutes.js'; import chat from './chatRoutes.js';
import market from './marketRoutes.js';
import plans from './planRoutes.js';
import trading from './tradingRoutes.js';
import checkout from './checkoutRoutes.js';
import orders from './orderRoutes.js';
import wallet from './walletRoutes.js';
import announcements from './announcementRoutes.js';
import mongoose from 'mongoose';
const r = Router();
r.use('/auth', auth); r.use('/users', users); r.use('/subscriptions', subs); r.use('/payments', pay);
r.use('/webhooks', webhooks); r.use('/admin', admin); r.use('/chat', chat); r.use('/market', market); r.use('/trading', trading);
// Public pricing catalogue (published plans only). Serves the pricing page
// and checkout plan resolution — never exposes drafts or internal fields.
r.use('/plans', plans);
// Unified checkout (quote → order → payment session) + purchase order history.
// Distinct from /trading/orders, which are paper-trading exchange orders.
r.use('/checkout', checkout);
r.use('/orders', orders);
// Real-money wallet (deposits, ledger, history). Distinct from /trading/wallet,
// which is the PAPER-trading simulation.
r.use('/wallet', wallet);
r.use('/announcements', announcements);
// Liveness: process is up and serving. Cheap, never touches dependencies, so
// it is safe for a Kubernetes/PM2 liveness probe (a DB blip must not restart
// the process).
r.get('/health', (req, res) => res.json({ success: true, message: 'OK', data: { db: mongoose.connection.readyState === 1 ? 'up' : 'down', time: new Date().toISOString() } }));
r.get('/health/live', (_req, res) => res.json({ success: true, message: 'OK', data: { status: 'live', uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() } }));
// Readiness: dependencies are actually usable. Returns 503 when the database
// is not connected so traffic is not routed to an instance that cannot serve.
r.get('/health/ready', async (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  let ping = false;
  if (dbUp) { try { await mongoose.connection.db.admin().command({ ping: 1 }); ping = true; } catch { ping = false; } }
  const ready = dbUp && ping;
  return res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'READY' : 'NOT_READY',
    data: { status: ready ? 'ready' : 'not_ready', db: dbUp ? 'up' : 'down', dbPing: ping, time: new Date().toISOString() },
  });
});
export default r;