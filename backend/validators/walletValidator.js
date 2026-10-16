import { z } from 'zod';

// Wallet deposits. The client may ONLY choose a whole-dollar preset amount and
// supply an idempotency key — never a price, a status or a balance.

export const createDepositSchema = z.object({
  amountMinor: z.number().int().positive().max(10_000_000),
  idempotencyKey: z.string().min(8).max(120).optional(),
});

// Filters for the transaction history view. Every field is optional and every
// enum is checked, so an unbounded query can never be injected.
export const listTransactionsSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: z.string().max(40).optional(),
  status: z.string().max(20).optional(),
  provider: z.string().max(20).optional(),
  q: z.string().max(64).optional(),
  from: z.string().max(40).optional(),
  to: z.string().max(40).optional(),
});

export const depositVerifySchema = z.object({
  // The provider payment id the return URL may carry. DISPLAY/POLLING ONLY —
  // it is always re-checked against the provider server-side, never trusted.
  paymentId: z.string().max(64).optional(),
});
