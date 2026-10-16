import { z } from 'zod';

// ---------------------------------------------------------------------------
// Pricing & Plans validation. Prices are accepted as INTEGER CENTS only — a
// float, string or negative amount is rejected at the edge so no malformed
// money value can ever reach the database.
// ---------------------------------------------------------------------------

const slug = z.string().trim().min(2).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase kebab-case');
const cents = z.number().int('price must be an integer number of cents').min(0).max(100_000_000);
const currency = z.string().trim().length(3).transform((s) => s.toUpperCase());

const limitsSchema = z.object({
  // -1 means "unmetered"
  aiLimit: z.number().int().min(-1).max(1_000_000).optional(),
  watchlists: z.number().int().min(-1).max(100_000).optional(),
  alerts: z.number().int().min(-1).max(100_000).optional(),
}).strict();

const providerPriceIdsSchema = z.object({
  razorpay: z.string().trim().max(120).nullable().optional(),
  stripe: z.string().trim().max(120).nullable().optional(),
}).strict();

const baseFields = {
  name: z.string().trim().min(2).max(60),
  slug,
  blurb: z.string().trim().max(200).optional(),
  description: z.string().trim().max(1000).optional(),
  priceCents: cents,
  currency: currency.optional(),
  interval: z.enum(['month', 'year']).optional(),
  intervalCount: z.number().int().min(1).max(12).optional(),
  features: z.array(z.string().trim().min(1).max(160)).max(40).optional(),
  limits: limitsSchema.optional(),
  badge: z.string().trim().max(40).optional(),
  recommended: z.boolean().optional(),
  cta: z.string().trim().min(1).max(40).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  displayOrder: z.number().int().min(0).max(10_000).optional(),
  providerPriceIds: providerPriceIdsSchema.optional(),
};

export const createPlanSchema = z.object(baseFields).strict();

// Patch semantics: EVERY field optional (partial update), at least one present.
// Each field is wrapped in .optional() here so a caller can send any subset —
// sending { priceCents } alone must validate, not require name/slug again.
const optionalize = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, v.optional()]));
export const updatePlanSchema = z.object(optionalize(baseFields)).strict()
  .refine((o) => Object.keys(o).length > 0, { message: 'Provide at least one field to update' });

export const planStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'archived']),
}).strict();

export const reorderSchema = z.object({
  plans: z.array(z.object({
    id: z.string().regex(/^[a-f0-9]{24}$/i, 'invalid plan id'),
    displayOrder: z.number().int().min(0).max(10_000).optional(),
  })).min(1).max(200),
}).strict();

export const listPlansQuerySchema = z.object({
  status: z.enum(['draft', 'published', 'archived']).optional(),
}).strip();
