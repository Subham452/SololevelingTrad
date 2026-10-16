import { Router } from 'express';
import { webhook } from '../controllers/paymentController.js';
import { whopWebhook } from '../controllers/whopWebhookController.js';
const r = Router();
// Razorpay / Stripe (legacy unified path).
r.post('/payment', webhook);
// Whop — verified against the documented Standard Webhooks signature scheme.
// Mounted at POST /api/webhooks/whop, which is what the Whop dashboard expects.
r.post('/whop', whopWebhook);
export default r;