const mongoose = require('mongoose');

// follower follows following (a person, a provider or a business account: all are users).
const followSchema = new mongoose.Schema(
  {
    follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

followSchema.index({ follower: 1, following: 1 }, { unique: true });
followSchema.index({ following: 1, createdAt: -1 });
followSchema.index({ follower: 1, createdAt: -1 });

module.exports = mongoose.model('Follow', followSchema);
