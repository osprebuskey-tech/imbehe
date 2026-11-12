const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const TARGET_TYPES = ['post', 'comment', 'listing', 'message', 'user'];
const REASONS = ['spam', 'scam', 'inappropriate', 'harassment', 'false_info', 'prohibited_item', 'other'];
const REPORT_STATUS = ['open', 'actioned', 'dismissed'];

// A person's complaint about a post, comment, listing, private message or account. The snapshot keeps what was reported
// even if the author edits or deletes it afterwards, so a moderator always sees what the reporter saw.
const reportSchema = new mongoose.Schema(
  {
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: TARGET_TYPES, required: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, required: true },
    targetOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // whose content or account it is
    reason: { type: String, enum: REASONS, required: true },
    details: { type: String, trim: true, maxlength: 500 },
    snapshot: { type: String, maxlength: 400 },
    link: { type: String, maxlength: 200 },
    status: { type: String, enum: REPORT_STATUS, default: 'open' },
    resolution: {
      _id: false,
      action: { type: String, enum: ['dismiss', 'remove', 'warn'] },
      note: { type: String, maxlength: 500 },
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
    },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

// One report per person per item. Reporting again would only add noise for the moderators.
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: 1 });
reportSchema.index({ targetType: 1, targetId: 1, status: 1 });

module.exports = mongoose.model('Report', reportSchema);
module.exports.TARGET_TYPES = TARGET_TYPES;
module.exports.REASONS = REASONS;
module.exports.REPORT_STATUS = REPORT_STATUS;
