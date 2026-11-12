const router = require('express').Router();
const ctrl = require('../controllers/reportController');
const validate = require('../middleware/validate');
const { requireAuth, requireVerifiedEmail } = require('../middleware/auth');
const { socialLimiter } = require('../middleware/rateLimiters');
const v = require('../validators/reportValidators');

router.post('/', requireAuth, requireVerifiedEmail, socialLimiter, validate({ body: v.createBody }), ctrl.create);

module.exports = router;
