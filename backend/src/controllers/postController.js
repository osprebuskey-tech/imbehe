const asyncHandler = require('../middleware/asyncHandler');
const postService = require('../services/postService');
const { ok } = require('../utils/response');

const ctxOf = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });
const list = (res, { items, meta, ...rest }) => ok(res, items, { meta: { ...meta, ...rest } });

exports.create = asyncHandler(async (req, res) => ok(res, { post: await postService.create(req.user, req.validated.body) }, { status: 201 }));
exports.get = asyncHandler(async (req, res) => ok(res, { post: await postService.get(req.validated.params.id, req.user) }));
exports.update = asyncHandler(async (req, res) => ok(res, { post: await postService.update(req.user, req.validated.params.id, req.validated.body) }));
exports.remove = asyncHandler(async (req, res) => {
  await postService.remove(req.user, req.validated.params.id, ctxOf(req));
  ok(res, { message: 'Post removed' });
});

exports.feed = asyncHandler(async (req, res) => list(res, await postService.feed(req.user, req.validated.query)));
exports.discover = asyncHandler(async (req, res) => list(res, await postService.discover(req.user, req.validated.query)));
exports.showcase = asyncHandler(async (req, res) => ok(res, await postService.showcase()));
exports.saved = asyncHandler(async (req, res) => list(res, await postService.saved(req.user, req.validated.query)));

exports.like = asyncHandler(async (req, res) => ok(res, await postService.like(req.user, req.validated.params.id)));
exports.unlike = asyncHandler(async (req, res) => ok(res, await postService.unlike(req.user, req.validated.params.id)));
exports.save = asyncHandler(async (req, res) => ok(res, await postService.save(req.user, req.validated.params.id)));
exports.unsave = asyncHandler(async (req, res) => ok(res, await postService.unsave(req.user, req.validated.params.id)));
exports.share = asyncHandler(async (req, res) => ok(res, await postService.share(req.user, req.validated.params.id)));

exports.listComments = asyncHandler(async (req, res) => list(res, await postService.listComments(req.user, req.validated.params.id, req.validated.query)));
exports.addComment = asyncHandler(async (req, res) => ok(res, { comment: await postService.addComment(req.user, req.validated.params.id, req.validated.body) }, { status: 201 }));
exports.removeComment = asyncHandler(async (req, res) => {
  const { id, commentId } = req.validated.params;
  await postService.removeComment(req.user, id, commentId, ctxOf(req));
  ok(res, { message: 'Comment removed' });
});
