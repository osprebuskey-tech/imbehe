const { z } = require('zod');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { LISTING_KINDS, PRICE_TYPES, CONTACT_METHODS, TRANSACTION_OPTIONS } = require('../models/MarketListing');
const { objectId, paginationQuery, optionalParam, unique } = require('./commonValidators');

const rwf = z.number().int().min(0).max(1_000_000_000);

const priceRules = (v, ctx) => {
  const issue = (path, message) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (v.priceType === 'fixed') {
    if (v.priceMin === undefined) issue('priceMin', 'Enter the price');
    if (v.priceMax !== undefined) issue('priceMax', 'A fixed price has no upper price');
  }
  if (v.priceType === 'range' && (v.priceMin === undefined || v.priceMax === undefined)) issue('priceMin', 'Enter the lowest and the highest price');
  if (v.priceMin !== undefined && v.priceMax !== undefined && v.priceMin > v.priceMax) issue('priceMax', 'The highest price cannot be lower than the lowest');
};

const base = {
  kind: z.enum(LISTING_KINDS),
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(4000),
  category: objectId,
  details: z.record(z.string().max(40), z.union([z.string().trim().max(200), z.number().finite(), z.boolean()])).optional(),
  district: z.enum([...RWANDA_DISTRICTS]),
  sector: z.string().trim().max(60).optional(),
  priceType: z.enum(PRICE_TYPES),
  priceMin: rwf.optional(),
  priceMax: rwf.optional(),
  stock: z
    .object({ tracked: z.boolean(), quantity: z.number().int().min(0).max(1_000_000).optional(), note: z.string().trim().max(200).optional() })
    .strict()
    .refine((s) => !s.tracked || s.quantity !== undefined, { message: 'Enter how many are in stock', path: ['quantity'] })
    .optional(),
  contactMethods: z.array(z.enum(CONTACT_METHODS)).min(1).max(4).transform(unique).optional(),
  transactionOptions: z.array(z.enum(TRANSACTION_OPTIONS)).min(1).max(4).transform(unique).optional(),
};

const createListingBody = z
  .object({ ...base, mediaIds: z.array(objectId).max(8).optional(), status: z.enum(['active', 'inactive']).optional() })
  .strict()
  .superRefine(priceRules)
  .transform((b) => ({ ...b, mediaIds: unique(b.mediaIds || []) }));

// The kind of a listing never changes after it is created. Photos are added with the dedicated endpoint, not here.
const { kind: _kind, ...editable } = base;
const updateListingBody = z
  .object(editable)
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });

const statusBody = z.object({ status: z.enum(['active', 'inactive', 'sold', 'completed']) }).strict();
const takedownBody = z.object({ reason: z.string().trim().min(3).max(300) }).strict();

const listQuery = paginationQuery.extend({
  q: optionalParam(z.string().trim().min(2).max(100)),
  kind: optionalParam(z.enum(LISTING_KINDS)),
  category: optionalParam(objectId),
  district: optionalParam(z.enum([...RWANDA_DISTRICTS])),
  owner: optionalParam(objectId),
  minPrice: optionalParam(z.coerce.number().int().min(0)),
  maxPrice: optionalParam(z.coerce.number().int().min(0)),
  inStock: optionalParam(z.enum(['true'])),
  status: optionalParam(z.enum(['active', 'sold', 'completed'])),
  sort: optionalParam(z.enum(['newest', 'price_asc', 'price_desc'])),
  // Answers to the category's own fields: d[size]=M, d[year_min]=2015, d[year_max]=2020. Only with a category chosen.
  d: optionalParam(z.record(z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/), z.string().trim().min(1).max(100)).refine((o) => Object.keys(o).length <= 6, 'Use at most six filters')),
}).refine((q) => !q.d || q.category, { message: 'Choose a category to filter by its details', path: ['d'] });
const savedQuery = paginationQuery;
const mineQuery = paginationQuery.extend({ status: optionalParam(z.enum(['active', 'inactive', 'sold', 'completed'])) });
const compareQuery = z.object({
  ids: z.string().transform((s) => unique(s.split(',').map((x) => x.trim()).filter(Boolean))).pipe(z.array(objectId).min(2, 'Pick at least two to compare').max(4, 'Compare up to four at a time')),
});

module.exports = { savedQuery, createListingBody, updateListingBody, statusBody, takedownBody, listQuery, mineQuery, compareQuery };
