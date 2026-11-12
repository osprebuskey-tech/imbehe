const router = require('express').Router();
const ctrl = require('../controllers/followController');
const validate = require('../middleware/validate');
const { requireAuth, optionalAuth, requireVerifiedEmail } = require('../middleware/auth');
const { socialLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');
const { pageQuery } = require('../validators/postValidators');

// :id is the account being followed (a person, a provider or a business).
router.get('/:id/stats', optionalAuth, validate({ params: idParams }), ctrl.stats);
router.get('/:id/followers', validate({ params: idParams, query: pageQuery }), ctrl.followers);
router.get('/:id/following', validate({ params: idParams, query: pageQuery }), ctrl.following);
router.post('/:id', requireAuth, requireVerifiedEmail, socialLimiter, validate({ params: idParams }), ctrl.follow);
router.delete('/:id', requireAuth, requireVerifiedEmail, socialLimiter, validate({ params: idParams }), ctrl.unfollow);

module.exports = router;
