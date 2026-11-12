const router = require('express').Router();
const ctrl = require('../controllers/postController');
const validate = require('../middleware/validate');
const { requireAuth, optionalAuth, requireVerifiedEmail } = require('../middleware/auth');
const { socialLimiter, searchLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/postValidators');

// Reading is public (so posts can be discovered and shared); anything that changes something needs a signed-in, email-verified person.
const write = [requireAuth, requireVerifiedEmail, socialLimiter];

// Public welcome-page showcase: popular recent posts with pictures or videos from verified people (declared before '/:id').
router.get('/showcase', searchLimiter, ctrl.showcase);
router.get('/', optionalAuth, validate({ query: v.listPostsQuery }), ctrl.discover);
router.get('/feed', requireAuth, validate({ query: v.pageQuery }), ctrl.feed);
router.get('/saved', requireAuth, validate({ query: v.pageQuery }), ctrl.saved);
router.post('/', ...write, validate({ body: v.createPostBody }), ctrl.create);

router.get('/:id', optionalAuth, validate({ params: idParams }), ctrl.get);
router.put('/:id', ...write, validate({ params: idParams, body: v.updatePostBody }), ctrl.update);
router.delete('/:id', requireAuth, validate({ params: idParams }), ctrl.remove);

router.post('/:id/like', ...write, validate({ params: idParams }), ctrl.like);
router.delete('/:id/like', ...write, validate({ params: idParams }), ctrl.unlike);
router.post('/:id/save', ...write, validate({ params: idParams }), ctrl.save);
router.delete('/:id/save', ...write, validate({ params: idParams }), ctrl.unsave);
router.post('/:id/share', ...write, validate({ params: idParams }), ctrl.share);

router.get('/:id/comments', optionalAuth, validate({ params: idParams, query: v.pageQuery }), ctrl.listComments);
router.post('/:id/comments', ...write, validate({ params: idParams, body: v.commentBody }), ctrl.addComment);
router.delete('/:id/comments/:commentId', requireAuth, validate({ params: v.commentParams }), ctrl.removeComment);

module.exports = router;
