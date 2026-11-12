const asyncHandler = require('../middleware/asyncHandler');
const followService = require('../services/followService');
const { ok } = require('../utils/response');

exports.follow = asyncHandler(async (req, res) => ok(res, await followService.follow(req.user, req.validated.params.id)));
exports.unfollow = asyncHandler(async (req, res) => ok(res, await followService.unfollow(req.user, req.validated.params.id)));
exports.stats = asyncHandler(async (req, res) => ok(res, await followService.stats(req.validated.params.id, req.user)));
exports.following = asyncHandler(async (req, res) => {
  const { items, meta } = await followService.listFollowing(req.validated.params.id, req.validated.query);
  ok(res, items, { meta });
});
exports.followers = asyncHandler(async (req, res) => {
  const { items, meta } = await followService.listFollowers(req.validated.params.id, req.validated.query);
  ok(res, items, { meta });
});
