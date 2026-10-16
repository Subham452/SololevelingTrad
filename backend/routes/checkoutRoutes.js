import { Router } from 'express';
import * as c from '../controllers/checkoutController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../validators/validationMiddleware.js';
import {
  quoteSchema,
  createOrderSchema,
  paymentSessionSchema,
  completeSimulatedSchema,
} from '../validators/checkoutValidator.js';
import { checkoutWriteLimiter, checkoutReadLimiter } from '../middleware/rateLimitMiddleware.js';

const r = Router();

// Every checkout route requires an authenticated user. Orders are always
// scoped to req.user.sub — ownership is checked inside the service, never
// taken from the request body.
r.use(authenticate);

// Money-touching writes get a strict budget; reads get room to poll.
r.post('/quote', checkoutWriteLimiter, validate(quoteSchema), c.quote);
r.post('/orders', checkoutWriteLimiter, validate(createOrderSchema), c.create);
r.post('/payment-session', checkoutWriteLimiter, validate(paymentSessionSchema), c.paymentSession);
r.post('/complete-simulated', checkoutWriteLimiter, validate(completeSimulatedSchema), c.completeSimulated);

r.get('/config', checkoutReadLimiter, c.config);
r.get('/orders', checkoutReadLimiter, c.list);
r.get('/orders/:id', checkoutReadLimiter, c.byId);
r.get('/orders/:id/status', checkoutReadLimiter, c.status);

export default r;
