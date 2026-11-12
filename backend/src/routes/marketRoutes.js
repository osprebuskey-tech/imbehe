const router = require('express').Router();
const ctrl = require('../controllers/marketController');
const validate = require('../middleware/validate');
const { requireAuth, optionalAuth, requireRoles, requireVerifiedEmail } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/marketValidators');

// Browsing is public. Publishing needs a signed-in person with a confirmed email address; staff accounts cannot publish.
const write = [requireAuth, requireVerifiedEmail, writeLimiter];

router.get('/', optionalAuth, validate({ query: v.listQuery }), ctrl.browse);
router.get('/mine', requireAuth, validate({ query: v.mineQuery }), ctrl.mine);
router.get('/saved', requireAuth, validate({ query: v.savedQuery }), ctrl.saved);
router.get('/compare', optionalAuth, validate({ query: v.compareQuery }), ctrl.compare);
router.post('/', ...write, validate({ body: v.createListingBody }), ctrl.create);

router.get('/:id', optionalAuth, validate({ params: idParams }), ctrl.get);
router.put('/:id', ...write, validate({ params: idParams, body: v.updateListingBody }), ctrl.update);
router.patch('/:id/status', ...write, validate({ params: idParams, body: v.statusBody }), ctrl.setStatus);
router.delete('/:id', requireAuth, validate({ params: idParams }), ctrl.remove);
router.post('/:id/save', requireAuth, writeLimiter, validate({ params: idParams }), ctrl.save);
router.delete('/:id/save', requireAuth, writeLimiter, validate({ params: idParams }), ctrl.unsave);

// Moderation: administrators hide or restore a listing, with a reason that the owner is told.
const admin = [requireAuth, requireRoles(ROLES.ADMIN)];
router.post('/:id/takedown', ...admin, validate({ params: idParams, body: v.takedownBody }), ctrl.takeDown);
router.post('/:id/restore', ...admin, validate({ params: idParams }), ctrl.restore);

module.exports = router;
