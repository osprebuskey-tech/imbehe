const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');

const mediaSchema = new mongoose.Schema(
  {
    asset: { type: mongoose.Schema.Types.ObjectId, ref: 'MediaAsset', required: true },
    url: { type: String, required: true },
    kind: { type: String, enum: ['image', 'video'], required: true },
    mime: { type: String },
    durationSeconds: { type: Number },
  },
  { _id: false },
);

const postSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    caption: { type: String, trim: true, maxlength: 2000, default: '' },
    hashtags: { type: [{ type: String, lowercase: true, trim: true, maxlength: 40 }], default: [] },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory' },
    location: { district: { type: String, enum: [...RWANDA_DISTRICTS] } },
    // A post can promote one of the author's own product or business listings; the app then shows View and Request-a-quotation actions.
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketListing' },
    media: { type: [mediaSchema], default: [] },
    // removed = taken down by its author or by a moderator; kept so reports and audit entries still point at something.
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    likeCount: { type: Number, default: 0, min: 0 },
    commentCount: { type: Number, default: 0, min: 0 },
    saveCount: { type: Number, default: 0, min: 0 },
    shareCount: { type: Number, default: 0, min: 0 },
    // A simple popularity number kept up to date as people engage: likes + saves + 2 x comments + 2 x shares. Used for "trending".
    score: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

postSchema.index({ status: 1, createdAt: -1 });
postSchema.index({ author: 1, status: 1, createdAt: -1 });
postSchema.index({ status: 1, score: -1, createdAt: -1 });
postSchema.index({ hashtags: 1, status: 1, createdAt: -1 });
postSchema.index({ category: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Post', postSchema);
