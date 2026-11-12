const mongoose = require('mongoose');

const schema = new mongoose.Schema(
  {
    post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One per person per post: this index is what makes liking (and saving) idempotent even under double taps and races.
schema.index({ post: 1, user: 1 }, { unique: true });
schema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PostLike', schema);
