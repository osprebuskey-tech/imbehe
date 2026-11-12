const multer = require('multer');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const { detectImageType, detectDocumentType } = require('../utils/imageType');
const { detectVideo } = require('../utils/videoInfo');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 10 * 1024 },
});

/** Parses one multipart image (field name "image"), then checks the file's real type from its bytes. */
const singleImage = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new AppError(413, `Image must be smaller than ${env.MAX_UPLOAD_MB} MB`, 'FILE_TOO_LARGE'));
      }
      if (err instanceof multer.MulterError) {
        return next(new AppError(400, 'Invalid upload', 'INVALID_UPLOAD'));
      }
      return next(err);
    }
    if (!req.file) return next(new AppError(400, 'An image file is required (field "image")', 'NO_FILE'));

    const type = detectImageType(req.file.buffer);
    if (!type) return next(new AppError(400, 'Only JPEG, PNG or WebP images are allowed', 'INVALID_FILE_TYPE'));

    req.image = { buffer: req.file.buffer, ...type };
    return next();
  });
};

singleImage.docs = { upload: true };

// Registration documents: one PDF, JPG or PNG ("file"), checked by size and by its real bytes, never by the client's claims.
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_DOCUMENT_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 10 * 1024 },
});

const singleDocument = (req, res, next) => {
  documentUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `Document must be smaller than ${env.MAX_DOCUMENT_MB} MB`, 'FILE_TOO_LARGE'));
      if (err instanceof multer.MulterError) return next(new AppError(400, 'Invalid upload', 'INVALID_UPLOAD'));
      return next(err);
    }
    if (!req.file) return next(new AppError(400, 'A document file is required (field "file")', 'NO_FILE'));
    const type = detectDocumentType(req.file.buffer);
    if (!type) return next(new AppError(400, 'Only PDF, JPG or PNG documents are allowed', 'INVALID_FILE_TYPE'));
    req.document = { buffer: req.file.buffer, size: req.file.size, originalName: String(req.file.originalname || 'document').replace(/[^\w.\- ]/g, '_').slice(0, 120), ...type };
    return next();
  });
};
singleDocument.docs = { upload: true };

// Posts, listings and requests: one photo (JPEG, PNG, WebP) or one short video (MP4, MOV, WebM) in field "media". The type and the video's
// length come from the file's own bytes. A video longer than MAX_VIDEO_SECONDS, or whose length cannot be read, is refused.
const mediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_VIDEO_MB * 1024 * 1024, files: 1, fields: 10, fieldSize: 10 * 1024 },
});

const singleMedia = (req, res, next) => {
  mediaUpload.single('media')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `File must be smaller than ${env.MAX_VIDEO_MB} MB`, 'FILE_TOO_LARGE'));
      if (err instanceof multer.MulterError) return next(new AppError(400, 'Invalid upload', 'INVALID_UPLOAD'));
      return next(err);
    }
    if (!req.file) return next(new AppError(400, 'A photo or video file is required (field "media")', 'NO_FILE'));
    const buffer = req.file.buffer;

    const image = detectImageType(buffer);
    if (image) {
      if (buffer.length > env.MAX_UPLOAD_MB * 1024 * 1024) return next(new AppError(413, `Photos must be smaller than ${env.MAX_UPLOAD_MB} MB`, 'FILE_TOO_LARGE'));
      req.media = { buffer, size: buffer.length, kind: 'image', ...image };
      return next();
    }
    const video = detectVideo(buffer);
    if (!video) return next(new AppError(400, 'Only JPEG, PNG or WebP photos, or MP4, MOV or WebM videos, are allowed', 'INVALID_FILE_TYPE'));
    if (video.durationSeconds === null) return next(new AppError(400, 'We could not read the length of this video. Please export it as a standard MP4.', 'VIDEO_DURATION_UNKNOWN'));
    // A little tolerance for rounding in the file header (10.04 s is a 10 s clip).
    if (video.durationSeconds > env.MAX_VIDEO_SECONDS + 0.25) {
      return next(new AppError(400, `Videos can be at most ${env.MAX_VIDEO_SECONDS} seconds long`, 'VIDEO_TOO_LONG'));
    }
    req.media = { buffer, size: buffer.length, ...video, durationSeconds: Math.round(video.durationSeconds * 10) / 10 };
    return next();
  });
};
singleMedia.docs = { upload: { field: 'media', description: 'A JPEG, PNG or WebP photo, or an MP4, MOV or WebM video of at most 10 seconds; type and length are checked from the file bytes' } };

module.exports = { singleImage, singleDocument, singleMedia };
