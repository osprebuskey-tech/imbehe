const asyncHandler = require('../middleware/asyncHandler');
const notificationService = require('../services/notificationService');
const { ok } = require('../utils/response');
const { buildMeta } = require('../utils/query');

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, unread, category } = req.validated.query;
  const { items, total } = await notificationService.list(req.user, { page, limit, unread: unread === 'true', category });
  const { unreadCount, byCategory } = await notificationService.unreadByCategory(req.user);
  ok(res, items, { meta: { ...buildMeta({ page, limit, total }), unreadCount, byCategory } });
});

exports.unreadCount = asyncHandler(async (req, res) => {
  ok(res, await notificationService.unreadByCategory(req.user));
});

exports.markRead = asyncHandler(async (req, res) => {
  ok(res, { notification: await notificationService.markRead(req.user, req.validated.params.id) });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  ok(res, { updated: await notificationService.markAllRead(req.user, req.validated.body) });
});
