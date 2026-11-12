const mongoose = require('mongoose');
const { RWANDA_DISTRICTS } = require('../utils/rwanda');
const { toJSONOptions } = require('./helpers');

// A product or business offer ("a shop", "a restaurant", "a plot of land", "fresh avocados"). Service offers keep using ServiceListing;
// this model is for everything else that is sold or promoted, and is owned by a person or business account (not a provider profile).
const LISTING_KINDS = ['product', 'business'];
const MARKET_STATUS = ['active', 'inactive', 'sold', 'completed'];
const PRICE_TYPES = ['fixed', 'range', 'negotiable'];
const CONTACT_METHODS = ['message', 'phone', 'email', 'visit'];
const TRANSACTION_OPTIONS = ['quotation', 'direct_purchase', 'pickup', 'delivery'];

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

const wholeRwf = { type: Number, min: 0, validate: { validator: Number.isInteger, message: 'Price must be a whole number of RWF' } };

const schema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: LISTING_KINDS, required: true },
    name: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
    description: { type: String, required: true, trim: true, minlength: 10, maxlength: 4000 },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceCategory', required: true },
    // Answers to the category's required fields (set by the super administrator), keyed by field key.
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    media: { type: [mediaSchema], default: [] },
    location: { district: { type: String, enum: [...RWANDA_DISTRICTS], required: true }, sector: { type: String, trim: true, maxlength: 60 } },

    priceType: { type: String, enum: PRICE_TYPES, required: true },
    priceMin: wholeRwf, // the price for "fixed"; the lower end for "range"; an optional guide for "negotiable"
    priceMax: wholeRwf,

    stock: {
      tracked: { type: Boolean, default: false },
      quantity: { type: Number, min: 0, validate: { validator: Number.isInteger, message: 'Quantity must be a whole number' } },
      note: { type: String, trim: true, maxlength: 200 }, // availability, such as "Open Mon-Sat" or "Ready in 2 days"
    },

    // How the owner wants to be reached and how they like to trade. Phone numbers and emails are never stored here: they stay hidden
    // until a quotation is accepted (see contact privacy).
    contactMethods: { type: [{ type: String, enum: CONTACT_METHODS }], default: ['message'] },
    transactionOptions: { type: [{ type: String, enum: TRANSACTION_OPTIONS }], default: ['quotation'] },

    status: { type: String, enum: MARKET_STATUS, default: 'active' },
    // Set when an administrator hides the listing. The owner can still see it, but cannot make it active again.
    takenDown: { at: Date, by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, reason: { type: String, maxlength: 300 } },
  },
  { timestamps: true, toJSON: toJSONOptions(), minimize: false },
);

schema.index({ status: 1, kind: 1, category: 1, createdAt: -1 });
schema.index({ status: 1, 'location.district': 1, priceMin: 1 });
schema.index({ owner: 1, status: 1, createdAt: -1 });
schema.index({ name: 'text', description: 'text' }, { weights: { name: 5, description: 1 }, name: 'market_text' });

module.exports = mongoose.model('MarketListing', schema);
Object.assign(module.exports, { LISTING_KINDS, MARKET_STATUS, PRICE_TYPES, CONTACT_METHODS, TRANSACTION_OPTIONS });
