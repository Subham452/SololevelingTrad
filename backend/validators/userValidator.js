import { z } from 'zod';

// The profile edit form submits every field, using "" for blanks. Zod's
// .optional() only treats a field as optional when it's absent/undefined — an
// empty string still runs the validators, so firstName:"" fails .min(1) and
// username:"" fails .min(3), producing a spurious "Validation failed".
// Normalize: for the constrained fields (min-length / url), "" means "leave
// unchanged" -> undefined. The free-text fields accept "" (= clear) and the
// controller stores it as null.
const blankToUndefined = (v) => (v === '' ? undefined : v);

export const updateMeSchema = z.object({
  firstName: z.preprocess(blankToUndefined, z.string().min(1).max(50).optional()),
  lastName: z.string().max(50).optional(),
  username: z.preprocess(blankToUndefined, z.string().min(3).max(30).optional()),
  avatar: z.preprocess(blankToUndefined, z.string().url().optional()),
  phone: z.string().max(20).optional(),
  country: z.string().max(60).optional(),
  timezone: z.string().max(60).optional(),
  bio: z.string().max(500).optional(),
});
export const adminUpdateUserSchema = updateMeSchema.extend({ role: z.enum(['user','support','admin','superadmin']).optional(), status: z.enum(['active','inactive','suspended','banned','pending']).optional(), notes: z.string().max(2000).optional() });
