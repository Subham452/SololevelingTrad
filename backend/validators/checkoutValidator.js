import { z } from 'zod';

// ---------------------------------------------------------------------------
// Unified checkout validation.
//
// NOTE what is NOT accepted here: price, subtotal, fee, tax, total, currency.
// Those are never client-supplied — the server derives every money figure.
// The client only ever says WHAT is being bought.
// ---------------------------------------------------------------------------

const qty = z.coerce
  .number({ invalid_type_error: 'Quantity must be a number' })
  .finite('Quantity must be a finite number')
  .positive('Quantity must be greater than zero')
  .max(1e9, 'Quantity is too large');

export const quoteSchema = z
  .object({
    type: z.enum(['subscription', 'crypto']).default('subscription'),
    // Subscription identity
    planSlug: z.string().trim().min(1).max(80).optional(),
    plan: z.string().trim().min(1).max(80).optional(),
    // Crypto identity
    asset: z.string().trim().min(1).max(64).optional(),
    quantity: qty.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.type === 'subscription' && !v.planSlug && !v.plan) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['planSlug'], message: 'A plan is required' });
    }
    if (v.type === 'crypto') {
      if (!v.asset) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['asset'], message: 'An asset is required' });
      if (v.quantity === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['quantity'], message: 'A quantity is required' });
    }
  });

export const createOrderSchema = z
  .object({
    // Server-signed quote token. Its HMAC + expiry are verified server-side,
    // which is how invalid/stale quotes are rejected.
    quoteToken: z.string().trim().min(20, 'A valid quote is required').max(4000),
    // Optional client idempotency key — duplicate submits collapse into one order.
    idempotencyKey: z.string().trim().min(8).max(128).optional(),
  })
  .strict();

export const paymentSessionSchema = z
  .object({ orderId: z.string().trim().min(24).max(24) })
  .strict();

export const completeSimulatedSchema = z
  .object({ orderId: z.string().trim().min(24).max(24) })
  .strict();
