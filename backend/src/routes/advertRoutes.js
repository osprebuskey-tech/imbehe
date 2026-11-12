const router = require('express').Router();
const ctrl = require('../controllers/advertController');
const validate = require('../middleware/validate');
const { requireAuth, requireRoles } = require('../middleware/auth');
const { singleImage } = require('../middleware/upload');
const { searchLimiter } = require('../middleware/rateLimiters');
const { ROLES } = require('../utils/roles');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/advertValidators');

// The welcome page reads this without an account: only active adverts that have not ended.
router.get('/', searchLimiter, ctrl.listPublic);

// Managing adverts is for the super administrator alone (ordinary administrators are not admitted).
const superOnly = [requireAuth, requireRoles(ROLES.SUPER_ADMIN)];
router.get('/manage', ...superOnly, ctrl.listAll);
router.post('/', ...superOnly, singleImage, validate({ body: v.createAdvertBody }), ctrl.create);
router.put('/:id', ...superOnly, validate({ params: idParams, body: v.updateAdvertBody }), ctrl.update);
router.post('/:id/image', ...superOnly, validate({ params: idParams }), singleImage, ctrl.replaceImage);
router.delete('/:id', ...superOnly, validate({ params: idParams }), ctrl.remove);

module.exports = router;
