const asyncHandler = require('../middleware/asyncHandler');
const advertService = require('../services/advertService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.listPublic = asyncHandler(async (req, res) => ok(res, await advertService.listPublic()));
exports.listAll = asyncHandler(async (req, res) => ok(res, await advertService.listAll()));
exports.create = asyncHandler(async (req, res) => ok(res, { advert: await advertService.create(req.validated.body, req.image, req.user, ctxOf(req)) }, { status: 201 }));
exports.update = asyncHandler(async (req, res) => ok(res, { advert: await advertService.update(req.validated.params.id, req.validated.body, req.user, ctxOf(req)) }));
exports.replaceImage = asyncHandler(async (req, res) => ok(res, { advert: await advertService.replaceImage(req.validated.params.id, req.image, req.user, ctxOf(req)) }));
exports.remove = asyncHandler(async (req, res) => {
  await advertService.remove(req.validated.params.id, req.user, ctxOf(req));
  ok(res, { message: 'Advert removed' });
});
