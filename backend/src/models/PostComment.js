const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const commentSchema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 1000 },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions() },
);

commentSchema.index({ post: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('PostComment', commentSchema);
