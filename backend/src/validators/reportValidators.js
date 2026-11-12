const { z } = require('zod');
const { objectId, optionalParam, paginationQuery } = require('./commonValidators');
const { TARGET_TYPES, REASONS, REPORT_STATUS } = require('../models/Report');

const createBody = z
  .object({
    targetType: z.enum(TARGET_TYPES),
    targetId: objectId,
    reason: z.enum(REASONS),
    details: z.string().trim().max(500).optional(),
  })
  .strict();

const listQuery = paginationQuery.extend({
  status: z.enum(REPORT_STATUS).default('open'),
  targetType: optionalParam(z.enum(TARGET_TYPES)),
});

const resolveBody = z
  .object({
    action: z.enum(['dismiss', 'remove', 'warn']),
    note: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine((b) => b.action === 'dismiss' || (b.note && b.note.length >= 3), { message: 'Write a short note: the person is told why', path: ['note'] });

module.exports = { createBody, listQuery, resolveBody };
