import { Router } from 'express';
import * as c from '../controllers/checkoutController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { checkoutReadLimiter } from '../middleware/rateLimitMiddleware.js';

// Purchase-order history aliases. `/api/orders` reads the unified checkout
// orders; paper-trading orders continue to live under `/api/trading/orders`,
// so the two are never conflated.
const r = Router();
r.use(authenticate, checkoutReadLimiter);
r.get('/', c.list);
r.get('/:id', c.byId);
r.get('/:id/status', c.status);

export default r;
