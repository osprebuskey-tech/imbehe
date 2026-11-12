const asyncHandler = require('../middleware/asyncHandler');
const service = require('../services/profileService');
const { ok } = require('../utils/response');

exports.get = asyncHandler(async (req, res) => ok(res, { profile: await service.getPublic(req.user, req.validated.params.id) }));
