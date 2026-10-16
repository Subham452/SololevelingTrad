import { z } from 'zod';

// Plan reference is validated for SHAPE here; existence + publish state are
// enforced server-side against the Plan collection (never trust the client).
// Accepts a slug (starter/basic/pro/elite/ultimate) or a legacy id.
const planRef = z.string().trim().min(1).max(60);

export const createSubSchema = z.object({
  plan: planRef,
  paymentId: z.string().optional(),
});
export const changePlanSchema = z.object({
  plan: planRef,
  paymentId: z.string().optional(),
});
