const mongoose = require('mongoose');

const NOTIFICATION_TYPES = [
  'request.new',
  'request.cancelled',
  'quotation.received',
  'quotation.updated',
  'quotation.withdrawn',
  'quotation.accepted',
  'quotation.rejected',
  'booking.updated',
  'review.received',
  'review.moderated',
  'payment.updated',
  'dispute.opened',
  'dispute.updated',
  'provider.verification',
  'verification.updated',
  'verification.recommendation',
  'contract.updated',
  'terms.updated',
  'account.verification',
  'post.liked',
  'post.commented',
  'follow.new',
  'listing.moderated',
  'message.new',
  'report.resolved',
  'moderation.notice',
];

// Three kinds of alert, shown separately in the app: quotations, messages, and everything else.
const CATEGORIES = ['quotation', 'message', 'general'];
const categoryOfType = (type) => (type === 'message.new' ? 'message' : String(type).startsWith('quotation.') ? 'quotation' : 'general');
const typesOfCategory = (category) => {
  if (category === 'message') return ['message.new'];
  if (category === 'quotation') return NOTIFICATION_TYPES.filter((t) => t.startsWith('quotation.'));
  return NOTIFICATION_TYPES.filter((t) => t !== 'message.new' && !t.startsWith('quotation.'));
};

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, trim: true, maxlength: 400 },
    link: { type: String, trim: true, maxlength: 200 }, // an in-app path such as /dashboard/requests/<id>
    readAt: { type: Date },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(doc, ret) {
        ret.id = String(ret._id);
        ret.category = categoryOfType(ret.type);
        delete ret._id;
        delete ret.__v;
        delete ret.user;
        return ret;
      },
    },
  },
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
module.exports.CATEGORIES = CATEGORIES;
module.exports.categoryOfType = categoryOfType;
module.exports.typesOfCategory = typesOfCategory;
