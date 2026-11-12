const { z } = require('zod');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { REQUEST_STATUS } = require('../models/ServiceRequest');
const { objectId, paginationQuery, optionalParam, futureOrTodayDay } = require('./commonValidators');

const MAX_MEDIA = 3;
const rwf = z.number().int().min(0).max(1_000_000_000); // whole RWF

const fields = {
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(3000),
  category: objectId,
  subcategory: z.string().trim().toLowerCase().max(80).optional(),
  location: z.object({ district: z.enum([...RWANDA_DISTRICTS]), sector: z.string().trim().max(60).optional() }).strict(),
  preferredDate: futureOrTodayDay.transform((s) => new Date(`${s}T00:00:00.000Z`)).optional(),
  budgetMin: rwf.optional(),
  budgetMax: rwf.optional(),
  budgetNegotiable: z.boolean().optional(),
};

const budgetOrder = (v, ctx) => {
  if (v.budgetMin !== undefined && v.budgetMax !== undefined && v.budgetMin > v.budgetMax) {
    ctx.addIssue({ code: 'custom', path: ['budgetMin'], message: 'budgetMin cannot be greater than budgetMax' });
  }
};

// Ids that decide who owns or can see a request (customer, company, status) are never accepted from the client.
const createRequestBody = z
  .object({
    ...fields,
    provider: objectId.optional(),
    onBehalfOfCompany: z.boolean().optional(),
    allowMultiple: z.boolean().optional(),
    mediaIds: z.array(objectId).max(MAX_MEDIA).optional(),
    fromListing: objectId.optional(),
    fromPost: objectId.optional(),
  })
  .strict()
  .superRefine(budgetOrder)
  .superRefine((v, ctx) => {
    if (v.fromListing && v.fromPost) ctx.addIssue({ code: 'custom', path: ['fromPost'], message: 'Start a request from a listing or from a post, not both' });
  });

const updateRequestBody = z
  .object({ ...fields, status: z.literal('cancelled') })
  .partial()
  .strict()
  .superRefine((v, ctx) => {
    const keys = Object.keys(v);
    if (keys.length === 0) ctx.addIssue({ code: 'custom', path: ['title'], message: 'Send at least one field to change' });
    if (v.status && keys.length > 1) ctx.addIssue({ code: 'custom', path: ['status'], message: 'Cancel a request on its own, without other changes' });
    budgetOrder(v, ctx);
  });

const listRequestsQuery = paginationQuery.extend({
  scope: optionalParam(z.enum(['mine', 'incoming', 'all'])),
  status: optionalParam(z.enum(REQUEST_STATUS)),
  category: optionalParam(objectId),
});

const quotationsQuery = z.object({ sort: optionalParam(z.enum(['newest', 'price', 'rating', 'speed'])) });

const attachmentParams = z.object({ id: objectId, attachmentId: objectId });

module.exports = { quotationsQuery, createRequestBody, updateRequestBody, listRequestsQuery, attachmentParams };
