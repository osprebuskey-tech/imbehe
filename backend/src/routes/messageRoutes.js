const router = require('express').Router();
const ctrl = require('../controllers/messageController');
const validate = require('../middleware/validate');
const { requireAuth, requireVerifiedEmail } = require('../middleware/auth');
const { socialLimiter } = require('../middleware/rateLimiters');
const { idParams } = require('../validators/commonValidators');
const v = require('../validators/messageValidators');

router.use(requireAuth);

router.get('/stream', ctrl.stream);
router.get('/unread', ctrl.unread);
router.get('/conversations', validate({ query: v.listQuery }), ctrl.list);
router.post('/conversations', requireVerifiedEmail, socialLimiter, validate({ body: v.startBody }), ctrl.start);
router.get('/conversations/:id', validate({ params: idParams, query: v.threadQuery }), ctrl.thread);
router.post('/conversations/:id/messages', requireVerifiedEmail, socialLimiter, validate({ params: idParams, body: v.sendBody }), ctrl.send);
router.post('/blocks/:id', validate({ params: idParams }), ctrl.block);
router.delete('/blocks/:id', validate({ params: idParams }), ctrl.unblock);

module.exports = router;
