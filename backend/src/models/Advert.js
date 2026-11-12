const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const ADVERT_STATUS = ['active', 'hidden'];

// A picture advert the super administrator puts on the welcome page. It stops showing by itself after `expiresAt`.
const advertSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
    text: { type: String, trim: true, maxlength: 200 },
    linkUrl: { type: String, trim: true, maxlength: 300 },
    imageUrl: { type: String, required: true },
    imageKey: { type: String, required: true },
    sortOrder: { type: Number, default: 0, min: 0, max: 10000 },
    status: { type: String, enum: ADVERT_STATUS, default: 'active' },
    expiresAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: toJSONOptions(['imageKey', 'createdBy']) },
);

advertSchema.index({ status: 1, sortOrder: 1, createdAt: -1 });

module.exports = mongoose.model('Advert', advertSchema);
module.exports.ADVERT_STATUS = ADVERT_STATUS;
