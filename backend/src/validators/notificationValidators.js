const { z } = require('zod');
const { paginationQuery, optionalParam } = require('./commonValidators');

const category = z.enum(['quotation', 'message', 'general']);

const listNotificationsQuery = paginationQuery.extend({ unread: optionalParam(z.enum(['true', 'false'])), category: optionalParam(category) });
// Optional body: mark only one kind as read ("Mark all as read" on the Quotations tab).
const markAllReadBody = z.object({ category: category.optional() }).strict().default({});

module.exports = { listNotificationsQuery, markAllReadBody };
