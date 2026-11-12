const router = require('express').Router();
const asyncHandler = require('../middleware/asyncHandler');
const { optionalAuth } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiters');
const { ok } = require('../utils/response');
const service = require('../services/discoverService');

// Public: trending products, popular businesses and top-rated providers. Open requests are added only for a verified provider.
router.get('/', searchLimiter, optionalAuth, asyncHandler(async (req, res) => ok(res, await service.discover(req.user))));

module.exports = router;
