const router = require('express').Router();
const ctrl = require('../controllers/profileController');
const validate = require('../middleware/validate');
const { optionalAuth } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');

// Public: anyone can open a profile. Signing in only adds "do I follow them".
router.get('/:id', searchLimiter, optionalAuth, validate({ params: idParams }), ctrl.get);

module.exports = router;
