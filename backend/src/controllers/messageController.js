const asyncHandler = require('../middleware/asyncHandler');
const realtime = require('../utils/realtime');
const service = require('../services/messageService');
const { ok } = require('../utils/response');

exports.start = asyncHandler(async (req, res) => ok(res, await service.start(req.user, req.validated.body), { status: 201 }));
exports.send = asyncHandler(async (req, res) => ok(res, { message: await service.send(req.user, req.validated.params.id, req.validated.body) }, { status: 201 }));
exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user, req.validated.query);
  ok(res, { conversations: items }, { meta });
});
exports.thread = asyncHandler(async (req, res) => ok(res, await service.thread(req.user, req.validated.params.id, req.validated.query)));
exports.stream = (req, res) => realtime.open(req, res, req.user._id);
exports.unread = asyncHandler(async (req, res) => ok(res, { unread: await service.unreadTotal(req.user) }));
exports.block = asyncHandler(async (req, res) => ok(res, await service.block(req.user, req.validated.params.id)));
exports.unblock = asyncHandler(async (req, res) => ok(res, await service.unblock(req.user, req.validated.params.id)));
