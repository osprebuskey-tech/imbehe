const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const CONTEXT_TYPES = ['listing', 'request', 'post'];

// A private chat between exactly two accounts. There is one conversation per pair; `context` is what it was last about
// (a listing, a request or a post), so a question about a product or a quotation arrives with its subject attached.
const conversationSchema = new mongoose.Schema(
  {
    pairKey: { type: String, required: true }, // "<smaller id>:<larger id>", makes the pair unique
    members: [
      {
        _id: false,
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        lastReadAt: { type: Date, default: () => new Date(0) },
      },
    ],
    context: {
      _id: false,
      type: { type: String, enum: CONTEXT_TYPES },
      id: { type: mongoose.Schema.Types.ObjectId },
      title: { type: String, trim: true, maxlength: 160 },
    },
    lastMessage: {
      _id: false,
      body: { type: String, maxlength: 200 },
      sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      at: { type: Date },
    },
  },
  { timestamps: true, toJSON: toJSONOptions(['pairKey']) },
);

conversationSchema.index({ pairKey: 1 }, { unique: true });
conversationSchema.index({ 'members.user': 1, 'lastMessage.at': -1 });

conversationSchema.statics.pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');

module.exports = mongoose.model('Conversation', conversationSchema);
module.exports.CONTEXT_TYPES = CONTEXT_TYPES;
