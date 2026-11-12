const asyncHandler = require('../middleware/asyncHandler');
const service = require('../services/reportService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

exports.create = asyncHandler(async (req, res) => ok(res, { report: await service.create(req.user, req.validated.body) }, { status: 201 }));
exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.validated.query);
  ok(res, { reports: items }, { meta });
});
exports.summary = asyncHandler(async (req, res) => ok(res, { summary: await service.summary() }));
exports.resolve = asyncHandler(async (req, res) => ok(res, { report: await service.resolve(req.user, req.validated.params.id, req.validated.body, ctxOf(req)) }));
