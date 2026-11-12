const asyncHandler = require('../middleware/asyncHandler');
const service = require('../services/marketService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const list = (res, { items, meta }) => ok(res, items, { meta });

exports.create = asyncHandler(async (req, res) => ok(res, { listing: await service.create(req.user, req.validated.body) }, { status: 201 }));
exports.update = asyncHandler(async (req, res) => ok(res, { listing: await service.update(req.user, req.validated.params.id, req.validated.body) }));
exports.setStatus = asyncHandler(async (req, res) => ok(res, { listing: await service.setStatus(req.user, req.validated.params.id, req.validated.body.status) }));
exports.remove = asyncHandler(async (req, res) => {
  await service.remove(req.user, req.validated.params.id);
  ok(res, { message: 'Listing deleted' });
});
exports.get = asyncHandler(async (req, res) => ok(res, { listing: await service.get(req.validated.params.id, req.user) }));
exports.browse = asyncHandler(async (req, res) => list(res, await service.browse(req.user, req.validated.query)));
exports.saved = asyncHandler(async (req, res) => list(res, await service.saved(req.user, req.validated.query)));
exports.save = asyncHandler(async (req, res) => ok(res, await service.save(req.user, req.validated.params.id)));
exports.unsave = asyncHandler(async (req, res) => ok(res, await service.unsave(req.user, req.validated.params.id)));
exports.mine = asyncHandler(async (req, res) => list(res, await service.mine(req.user, req.validated.query)));
exports.compare = asyncHandler(async (req, res) => ok(res, await service.compare(req.validated.query.ids, req.user)));
exports.takeDown = asyncHandler(async (req, res) => ok(res, { listing: await service.takeDown(req.user, req.validated.params.id, req.validated.body.reason, ctxOf(req)) }));
exports.restore = asyncHandler(async (req, res) => ok(res, { listing: await service.restore(req.user, req.validated.params.id, ctxOf(req)) }));
