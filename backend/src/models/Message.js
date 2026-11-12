const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
    // Set by a moderator after a report. The text is kept for the record and never shown again.
    removed: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false }, toJSON: toJSONOptions() },
);

messageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
