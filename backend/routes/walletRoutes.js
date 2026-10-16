import { Router } from 'express';
import * as c from '../controllers/walletController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { validate } from '../validators/validationMiddleware.js';
import {
  createDepositSchema,
  listTransactionsSchema,
  depositVerifySchema,
} from '../validators/walletValidator.js';
import { walletWriteLimiter, walletReadLimiter } from '../middleware/rateLimitMiddleware.js';

// ---------------------------------------------------------------------------
// Real-money wallet. EVERY route requires authentication and is scoped to
// req.user.sub inside the service — there is no way to read or alter another
// user's wallet from these endpoints.
// ---------------------------------------------------------------------------
const r = Router();
r.use(authenticate);

// Money-touching writes get a strict budget; reads carry history + polling.
r.get('/config', walletReadLimiter, c.config);
r.get('/', walletReadLimiter, c.summary);
r.get('/transactions', walletReadLimiter, validate(listTransactionsSchema, 'query'), c.transactions);
r.get('/transactions/:id', walletReadLimiter, c.transaction);

r.post('/deposits', walletWriteLimiter, validate(createDepositSchema), c.createDepositHandler);
r.get('/deposits/:reference', walletReadLimiter, c.depositStatus);
r.post('/deposits/:reference/verify', walletWriteLimiter, validate(depositVerifySchema), c.verifyDeposit);

export default r;
