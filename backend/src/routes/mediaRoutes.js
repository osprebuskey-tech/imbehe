const router = require('express').Router();
const ctrl = require('../controllers/mediaController');
const { requireAuth } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimiters');
const { singleMedia } = require('../middleware/upload');

// Any signed-in person can upload media; what it is attached to is checked where it is used.
router.post('/', requireAuth, writeLimiter, singleMedia, ctrl.upload);

module.exports = router;
