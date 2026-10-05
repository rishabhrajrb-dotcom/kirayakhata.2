// Strict request schemas (server-side; imports zod so it is not loaded in the browser).
// Unknown fields are rejected, ranges are sane, conditional requirements enforced.
import { z } from 'zod';
import { STATES } from './compliance-config.js';

const stateCode = z.string().regex(/^\d{2}$/).refine((s) => Boolean(STATES[s]), 'unknown state code');
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine((p) => p >= '2017-07' && p <= '2035-12', 'period out of range');
const paise = z.number().int().min(0).max(1_00_00_00_000_00); // up to Rs 100 crore

export const closeMonthSchema = z.object({
  period,
  landlord: z.object({
    gstRegType: z.enum(['regular', 'composition', 'unregistered', 'unknown']),
    stateCode,
    resident: z.boolean().nullable().optional(),
    panAvailable: z.boolean().nullable().optional(),
  }).strict(),
  tenant: z.object({
    gstRegType: z.enum(['regular', 'composition', 'unregistered', 'uin', 'unknown']),
    stateCode,
    category: z.enum(['company', 'firm_llp', 'trust_society_aop', 'government', 'individual_huf_audit', 'individual_huf_other', 'unknown']),
    proprietorOwnResidence: z.boolean().nullable().optional(),
  }).strict(),
  property: z.object({
    kind: z.enum(['residential_dwelling', 'commercial', 'unknown']),
    use: z.enum(['residence', 'business', 'unknown']),
    stateCode,
  }).strict(),
  assetKind: z.enum(['land_building', 'plant_machinery', 'unknown']).default('land_building'),
  special: z.array(z.enum(['sez', 'government_lessor', 'non_resident', 'co_owned', 'mixed_use', 'pg_hostel', 'short_stay', 'land', 'sublet', 'related_party', 'overseas_property', 'multiple_gstin'])).max(12).default([]),
  rentPaise: paise.refine((v) => v > 0, 'rent must be more than zero'),
  receivedPaise: paise.nullable().optional(),
  reportedTdsPaise: paise.nullable().optional(),
  lowerCertRateBp: z.number().int().min(0).max(2000).nullable().optional(),
  isDeductionMonth: z.boolean().optional(),
  fyRentToDatePaise: paise.optional(),
  note: z.string().max(280).optional(),
  sample: z.boolean().optional(),
  lang: z.enum(['en', 'hi']).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.property.kind === 'residential_dwelling' && v.property.use === 'unknown') {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['property', 'use'], message: 'say how the home is used' });
  }
  if (v.reportedTdsPaise != null && v.reportedTdsPaise > v.rentPaise) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reportedTdsPaise'], message: 'TDS cannot exceed the rent' });
  }
});

export const calendarSchema = z.object({
  gstRegType: z.enum(['regular', 'composition', 'unregistered']),
  gstFilingFrequency: z.enum(['monthly', 'qrmp']).optional(),
  stateCode,
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agreements: z.array(z.object({
    id: z.string().max(40), label: z.string().max(60), dueDay: z.number().int().min(1).max(31),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    tenantTdsKind: z.enum(['general', 'small_individual']).nullable().optional(),
  }).strict()).max(50).default([]),
  advanceTax: z.object({ estimatedTaxPaise: paise, seniorNoBusiness: z.boolean().optional() }).strict().optional(),
  completions: z.record(z.object({ markedAt: z.string().max(40), ackRef: z.string().max(40).optional() }).strict()).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.from > v.to) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'to must be after from' });
  const days = (Date.parse(v.to) - Date.parse(v.from)) / 86400000;
  if (days > 400) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'range too long' });
  if (v.gstRegType === 'regular' && !v.gstFilingFrequency) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gstFilingFrequency'], message: 'required for registered landlords' });
});

export function zodErrors(err) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}
