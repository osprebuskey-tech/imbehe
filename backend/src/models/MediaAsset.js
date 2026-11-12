const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

// One uploaded photo or short video. Posts (and later listings and requests) attach media by id, so only files that passed the upload
// checks, including the 10-second video limit, and that belong to the person attaching them, can ever be shown.
const mediaAssetSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    key: { type: String, required: true, unique: true },
    url: { type: String, required: true },
    kind: { type: String, enum: ['image', 'video'], required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    durationSeconds: { type: Number },
    attachedTo: { type: String, enum: ['post', 'listing', 'request', 'quotation'] }, // set once the file is used; a file is used once
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions(['owner', 'key']) },
);

module.exports = mongoose.model('MediaAsset', mediaAssetSchema);
