const ServiceCategory = require('../models/ServiceCategory');
const ServiceListing = require('../models/ServiceListing');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const { slugify } = require('../utils/slug');
const audit = require('./auditService');
const storage = require('./storage');

const toSubcategories = (names = []) => {
  const seen = new Set();
  return names
    .map((name) => ({ name, slug: slugify(name) }))
    .filter((s) => s.slug && !seen.has(s.slug) && seen.add(s.slug));
};

// Turns the labels an administrator typed into stored fields: a stable key from the label, de-duplicated, with options only for choice fields.
const toRequiredFields = (list = []) => {
  const seen = new Set();
  const out = [];
  for (const f of list) {
    const key = slugify(f.label).replace(/-/g, '_').slice(0, 40);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: f.label, type: f.type, required: f.required, options: f.type === 'select' ? [...new Set(f.options)] : [] });
  }
  return out;
};

const notFound = () => new AppError(404, 'Category not found', 'CATEGORY_NOT_FOUND');
const exists = () => new AppError(409, 'A category with this name already exists', 'CATEGORY_EXISTS');

function list({ includeDisabled = false, kind } = {}) {
  const filter = includeDisabled ? {} : { status: 'active' };
  // Categories made before kinds existed have no kind stored; they are services.
  if (kind) filter.kind = kind === 'service' ? { $in: ['service', null] } : kind;
  return ServiceCategory.find(filter).sort({ sortOrder: 1, name: 1 });
}

async function create(data, admin, ctx) {
  const slug = slugify(data.name);
  if (!slug) throw new AppError(400, 'Category name is not valid', 'VALIDATION_ERROR');
  if (await ServiceCategory.exists({ slug })) throw exists();

  const category = await ServiceCategory.create({
    name: data.name,
    slug,
    description: data.description,
    kind: data.kind,
    icon: data.icon,
    requiredFields: toRequiredFields(data.requiredFields),
    subcategories: toSubcategories(data.subcategories),
    status: data.status,
    sortOrder: data.sortOrder,
  });
  await audit.record({ actor: admin._id, action: 'category.create', entityType: 'ServiceCategory', entityId: category._id, metadata: { name: category.name }, ctx, strict: true });
  return category;
}

async function update(id, data, admin, ctx) {
  const category = await ServiceCategory.findById(id);
  if (!category) throw notFound();

  if (data.name !== undefined && data.name !== category.name) {
    const slug = slugify(data.name);
    if (!slug) throw new AppError(400, 'Category name is not valid', 'VALIDATION_ERROR');
    if (await ServiceCategory.exists({ slug, _id: { $ne: category._id } })) throw exists();
    category.name = data.name;
    category.slug = slug;
  }
  if (data.description !== undefined) category.description = data.description;
  if (data.kind !== undefined) category.kind = data.kind;
  if (data.icon !== undefined) category.icon = data.icon;
  if (data.requiredFields !== undefined) category.requiredFields = toRequiredFields(data.requiredFields);
  if (data.status !== undefined) category.status = data.status;
  if (data.sortOrder !== undefined) category.sortOrder = data.sortOrder;
  if (data.subcategories !== undefined) category.subcategories = toSubcategories(data.subcategories);

  await category.save();
  await audit.record({ actor: admin._id, action: 'category.update', entityType: 'ServiceCategory', entityId: category._id, metadata: { fields: Object.keys(data) }, ctx, strict: true });
  return category;
}

async function replaceImage(id, image, admin, ctx) {
  const category = await ServiceCategory.findById(id).select('+imageKey');
  if (!category) throw notFound();
  const saved = await storage.save({ ...image, folder: 'categories' });
  const oldKey = category.imageKey;
  try {
    category.imageKey = saved.key;
    category.imageUrl = saved.url;
    await category.save();
    await audit.record({ actor: admin._id, action: 'category.image_replace', entityType: 'ServiceCategory', entityId: category._id, ctx, strict: true });
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
  await storage.remove(oldKey);
  return category;
}

async function remove(id, admin, ctx) {
  const category = await ServiceCategory.findById(id).select('+imageKey');
  if (!category) throw notFound();

  const [listings, providers] = await Promise.all([
    ServiceListing.exists({ category: category._id }),
    ProviderProfile.exists({ categories: category._id }),
  ]);
  if (listings || providers) {
    throw new AppError(409, 'This category is in use. Disable it instead of deleting it.', 'CATEGORY_IN_USE');
  }

  await category.deleteOne();
  await storage.remove(category.imageKey);
  await audit.record({ actor: admin._id, action: 'category.delete', entityType: 'ServiceCategory', entityId: category._id, metadata: { name: category.name }, ctx, strict: true });
}

module.exports = { list, create, update, replaceImage, remove };
