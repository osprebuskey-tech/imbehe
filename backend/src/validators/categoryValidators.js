const { z } = require('zod');
const { objectId } = require('./commonValidators');

const requiredField = z
  .object({
    label: z.string().trim().min(2).max(60),
    type: z.enum(['text', 'number', 'select', 'yes_no']).default('text'),
    options: z.array(z.string().trim().min(1).max(60)).max(30).optional(),
    required: z.boolean().default(true),
  })
  .strict()
  .refine((f) => f.type !== 'select' || (f.options && f.options.length >= 2), { message: 'A choice field needs at least two options', path: ['options'] });

const fields = {
  kind: z.enum(['service', 'product', 'business']).optional(),
  icon: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{0,29}$/, 'Use a lowercase icon name').optional(),
  requiredFields: z.array(requiredField).max(15).optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  subcategories: z.array(z.string().trim().min(2).max(80)).max(30).optional(),
  status: z.enum(['active', 'disabled']).optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
};

const createCategoryBody = z.object(fields).strict();
const updateCategoryBody = z.object(fields).partial().strict();
const listCategoriesQuery = z.object({ includeDisabled: z.enum(['true', 'false']).optional(), kind: z.enum(['service', 'product', 'business']).optional() });

module.exports = { createCategoryBody, updateCategoryBody, listCategoriesQuery, objectId };
