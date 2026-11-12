const { z } = require('zod');
const { ADVERT_STATUS } = require('../models/Advert');

// Create arrives as multipart (image + text fields), so numbers are strings and are coerced.
const link = z.string().trim().max(300).url().refine((u) => /^https?:\/\//i.test(u), 'Use a link that starts with http:// or https://');
const future = z.string().datetime({ offset: true }).refine((v) => new Date(v).getTime() > Date.now(), 'The end time must be in the future').transform((v) => new Date(v));
const fields = {
  title: z.string().trim().min(3).max(100),
  text: z.string().trim().max(200),
  linkUrl: link,
  sortOrder: z.coerce.number().int().min(0).max(10000),
  status: z.enum(ADVERT_STATUS),
  expiresAt: future,
};

const createAdvertBody = z
  .object({ title: fields.title, text: fields.text.optional(), linkUrl: fields.linkUrl.optional(), sortOrder: fields.sortOrder.optional(), expiresAt: fields.expiresAt.optional(), status: fields.status.optional() })
  .strict();

// An empty text, link or end time clears it.
const updateAdvertBody = z
  .object({
    title: fields.title,
    text: fields.text,
    linkUrl: fields.linkUrl.or(z.literal('')),
    sortOrder: fields.sortOrder,
    status: fields.status,
    expiresAt: fields.expiresAt.or(z.literal('')),
  })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Send at least one field to change', path: ['title'] });

module.exports = { createAdvertBody, updateAdvertBody };
