const router = require('express').Router();
const ctrl = require('../controllers/authController');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, sensitiveLimiter } = require('../middleware/rateLimiters');
const { singleImage } = require('../middleware/upload');
const v = require('../validators/authValidators');

router.post('/register', authLimiter, validate({ body: v.registerBody }), ctrl.register);
router.post('/login', authLimiter, validate({ body: v.loginBody }), ctrl.login);
router.post('/logout', requireAuth, ctrl.logout);
router.get('/me', requireAuth, ctrl.me);
router.patch('/me', requireAuth, validate({ body: v.updateProfileBody }), ctrl.updateMe);
router.post('/me/avatar', requireAuth, singleImage, ctrl.uploadAvatar);
router.delete('/me/avatar', requireAuth, ctrl.removeAvatar);
router.post('/me/cover', requireAuth, singleImage, ctrl.uploadCover);
router.delete('/me/cover', requireAuth, ctrl.removeCover);
router.post('/change-password', requireAuth, authLimiter, validate({ body: v.changePasswordBody }), ctrl.changePassword);

router.post('/verify-email', authLimiter, validate({ body: v.verifyEmailBody }), ctrl.verifyEmail);
router.post('/resend-verification', requireAuth, sensitiveLimiter, ctrl.resendVerification);

router.post('/forgot-password', sensitiveLimiter, validate({ body: v.forgotPasswordBody }), ctrl.forgotPassword);
router.post('/reset-password', sensitiveLimiter, validate({ body: v.resetPasswordBody }), ctrl.resetPassword);

module.exports = router;
