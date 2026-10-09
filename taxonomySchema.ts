import { z } from 'zod';

/** Keys are snake_case field names such as `hook_type`. */
const fieldKey = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, 'Field names use lowercase letters, numbers and _');

const field = z.object({
  value: z.string().trim().max(1000).nullable(),
  // data.json has `confidence: null` where nothing applied (e.g. no person shown); stored as "no score"
  confidence: z.number().min(0).max(1).nullish().transform((c) => c ?? undefined),
});

const section = z.record(fieldKey, field).refine((v) => Object.keys(v).length <= 40, 'Too many fields');

/** The `creative_taxonomy` shape used by frontend/data.json. */
export const taxonomyDataSchema = z.object({
  confidence_threshold: z.number().min(0).max(1).optional(),
  intention_message: section.default({}),
  physical_execution: section.default({}),
});
