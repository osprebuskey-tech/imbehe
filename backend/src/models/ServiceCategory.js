const mongoose = require('mongoose');
const { toJSONOptions } = require('./helpers');

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, trim: true, lowercase: true, maxlength: 80 },
  },
  { _id: false },
);

// The extra details a listing in this category must carry (for example "Size" for fashion, "Plot area" for real estate). The super
// administrator defines them in the app, so a new kind of business needs no code change.
const CATEGORY_KINDS = ['service', 'product', 'business'];
const FIELD_TYPES = ['text', 'number', 'select', 'yes_no'];
const requiredFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, trim: true, lowercase: true, maxlength: 40 },
    label: { type: String, required: true, trim: true, maxlength: 60 },
    type: { type: String, enum: FIELD_TYPES, default: 'text' },
    options: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] }, // for type "select"
    required: { type: Boolean, default: true },
  },
  { _id: false },
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300 },
    // service = something done for you, product = something you buy, business = a shop, restaurant, farm or other commercial activity.
    // Categories made before this field existed read as "service".
    kind: { type: String, enum: CATEGORY_KINDS, default: 'service' },
    icon: { type: String, trim: true, lowercase: true, maxlength: 30 }, // a name from the app's icon set
    imageUrl: { type: String, trim: true, maxlength: 500 },
    imageKey: { type: String, trim: true, maxlength: 300, select: false },
    requiredFields: { type: [requiredFieldSchema], default: [] },
    subcategories: { type: [subcategorySchema], default: [] },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: toJSONOptions() },
);

categorySchema.index({ status: 1, sortOrder: 1, name: 1 });
categorySchema.index({ kind: 1, status: 1 });

module.exports = mongoose.model('ServiceCategory', categorySchema);
module.exports.CATEGORY_KINDS = CATEGORY_KINDS;
module.exports.FIELD_TYPES = FIELD_TYPES;
