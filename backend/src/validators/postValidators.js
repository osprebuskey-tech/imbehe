const { z } = require('zod');
const { objectId, paginationQuery, optionalParam, unique } = require('./commonValidators');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');

const hashtag = z.string().trim().toLowerCase().regex(/^#?[\p{L}\p{N}_]{2,40}$/u, 'Use letters and numbers only').transform((h) => h.replace(/^#/, ''));

const createPostBody = z
  .object({
    caption: z.string().trim().max(2000).optional(),
    mediaIds: z.array(objectId).max(6).optional(),
    hashtags: z.array(hashtag).max(10).optional(),
    category: objectId.optional(),
    district: z.enum([...RWANDA_DISTRICTS]).optional(),
    listingId: objectId.optional(),
  })
  .strict()
  .refine((b) => (b.caption && b.caption.length > 0) || (b.mediaIds && b.mediaIds.length > 0), { message: 'Write something or add a photo or video', path: ['caption'] })
  .transform((b) => ({ ...b, mediaIds: unique(b.mediaIds || []) }));

const updatePostBody = z
  .object({
    caption: z.string().trim().max(2000).optional(),
    hashtags: z.array(hashtag).max(10).optional(),
    category: objectId.nullable().optional(),
    district: z.enum([...RWANDA_DISTRICTS]).nullable().optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Nothing to change' });

const listPostsQuery = paginationQuery.extend({
  q: optionalParam(z.string().trim().min(2).max(100)),
  category: optionalParam(objectId),
  district: optionalParam(z.enum([...RWANDA_DISTRICTS])),
  hashtag: optionalParam(hashtag),
  author: optionalParam(objectId),
  sort: optionalParam(z.enum(['recent', 'trending'])),
});

const pageQuery = paginationQuery;
const commentBody = z.object({ body: z.string().trim().min(1, 'Write a comment').max(1000) }).strict();
const commentParams = z.object({ id: objectId, commentId: objectId });

module.exports = { createPostBody, updatePostBody, listPostsQuery, pageQuery, commentBody, commentParams };
