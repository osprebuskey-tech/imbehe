const mongoose = require('mongoose');

// A listing someone bookmarked to come back to.
const listingSaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    listing: { type: mongoose.Schema.Types.ObjectId, ref: 'MarketListing', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

listingSaveSchema.index({ user: 1, listing: 1 }, { unique: true });
listingSaveSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('ListingSave', listingSaveSchema);
