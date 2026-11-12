const { z } = require('zod');
const { objectId, optionalParam } = require('./commonValidators');
const { CONTEXT_TYPES } = require('../models/Conversation');

const body = z.string().trim().min(1, 'Write a message').max(2000);

const startBody = z
  .object({
    userId: objectId,
    body,
    context: z.object({ type: z.enum(CONTEXT_TYPES), id: objectId }).strict().optional(),
  })
  .strict();

const sendBody = z.object({ body }).strict();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// Messages are read newest first in pages; `before` is the id of the oldest message already on screen.
const threadQuery = z.object({
  before: optionalParam(objectId),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

module.exports = { startBody, sendBody, listQuery, threadQuery };
