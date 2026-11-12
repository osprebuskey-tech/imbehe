const asyncHandler = require('../middleware/asyncHandler');
const storage = require('../services/storage');
const MediaAsset = require('../models/MediaAsset');
const { ok } = require('../utils/response');

// One uploaded photo or short video, stored publicly under media/ and recorded as the uploader's. The caller then attaches it, by id,
// to a post, listing or request; only the owner can attach it, and only once.
exports.upload = asyncHandler(async (req, res) => {
  const { buffer, ext, mime, kind, size, durationSeconds } = req.media;
  const { key, url } = await storage.save({ buffer, ext, mime, folder: 'media' });
  const asset = await MediaAsset.create({ owner: req.user._id, key, url, kind, mime, size, ...(kind === 'video' ? { durationSeconds } : {}) });
  ok(res, { media: { id: String(asset._id), url, kind, mime, size, ...(kind === 'video' ? { durationSeconds } : {}) } }, { status: 201 });
});
