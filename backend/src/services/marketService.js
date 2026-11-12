const MarketListing = require('../models/MarketListing');
const MediaAsset = require('../models/MediaAsset');
const ServiceCategory = require('../models/ServiceCategory');
const ListingSave = require('../models/ListingSave');
const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const AppError = require('../utils/AppError');
const { buildMeta, escapeRegex } = require('../utils/query');
const { isAdmin, isStaff } = require('../utils/roles');
const storage = require('./storage');
const audit = require('./auditService');
const notifications = require('./notificationService');
const { authorsFor } = require('./postService');

const idOf = (v) => String(v?._id ?? v);
const notFound = () => new AppError(404, 'Listing not found', 'LISTING_NOT_FOUND');

// ---- the category decides what a listing must say --------------------------------------------------------------------------
async function loadCategory(id, kind) {
  const category = await ServiceCategory.findOne({ _id: id, status: 'active' });
  if (!category) throw new AppError(400, 'That category does not exist', 'CATEGORY_NOT_FOUND');
  const categoryKind = category.kind || 'service';
  if (categoryKind !== kind) throw new AppError(400, `This category is for ${categoryKind} listings`, 'CATEGORY_KIND_MISMATCH');
  return category;
}

/** Checks the answers against the category's required fields (set by the super administrator). Unknown keys are refused. */
function checkDetails(category, details = {}) {
  const defs = new Map(category.requiredFields.map((f) => [f.key, f]));
  const clean = {};
  const problems = [];
  for (const [key, value] of Object.entries(details)) {
    const def = defs.get(key);
    if (!def) { problems.push(`“${key}” is not a detail of this category`); continue; }
    if (value === '' ) continue; // an empty answer counts as no answer
    const ok =
      (def.type === 'text' && typeof value === 'string') ||
      (def.type === 'number' && typeof value === 'number') ||
      (def.type === 'yes_no' && typeof value === 'boolean') ||
      (def.type === 'select' && typeof value === 'string' && def.options.includes(value));
    if (!ok) problems.push(`“${def.label}” has an answer that does not fit`);
    else clean[key] = value;
  }
  for (const def of category.requiredFields) {
    if (def.required && clean[def.key] === undefined) problems.push(`“${def.label}” is required`);
  }
  if (problems.length) throw new AppError(400, `Please check the details: ${problems.join('; ')}`, 'LISTING_DETAILS_INVALID', problems);
  return clean;
}

// ---- how a listing is shown -----------------------------------------------------------------------------------------------
async function decorate(listings, viewer) {
  if (!listings.length) return [];
  const ownerIds = [...new Set(listings.map((l) => idOf(l.owner)))];
  const [owners, verifiedUsers, verifiedProviders, categories, savedIds] = await Promise.all([
    authorsFor(ownerIds),
    User.find({ _id: { $in: ownerIds }, accountVerified: true }).distinct('_id'),
    ProviderProfile.find({ user: { $in: ownerIds }, verificationStatus: 'verified' }).distinct('user'),
    ServiceCategory.find({ _id: { $in: listings.map((l) => l.category) } }).select('name slug kind requiredFields'),
    viewer ? ListingSave.find({ user: viewer._id, listing: { $in: listings.map((l) => l._id) } }).distinct('listing') : [],
  ]);
  const savedSet = new Set(savedIds.map(String));
  const verified = new Set([...verifiedUsers, ...verifiedProviders].map(String));
  const cat = new Map(categories.map((c) => [String(c._id), c]));
  return listings.map((l) => {
    const json = l.toJSON();
    const c = cat.get(idOf(l.category));
    json.owner = { ...(owners.get(idOf(l.owner)) ?? { id: idOf(l.owner), fullName: 'Former member', type: 'customer' }), verified: verified.has(idOf(l.owner)) };
    json.category = c ? { id: String(c._id), name: c.name, slug: c.slug, kind: c.kind || 'service' } : { id: idOf(l.category) };
    // The labels let the app print "Size: M" without a second request.
    json.detailList = c ? c.requiredFields.filter((f) => json.details?.[f.key] !== undefined).map((f) => ({ key: f.key, label: f.label, value: json.details[f.key] })) : [];
    json.inStock = !l.stock?.tracked || (l.stock.quantity ?? 0) > 0;
    json.saved = savedSet.has(String(l._id));
    json.mine = Boolean(viewer && idOf(l.owner) === String(viewer._id));
    if (!json.mine && !(viewer && isAdmin(viewer))) delete json.takenDown;
    return json;
  });
}

const page = async (filter, sort, { page: pageNo, limit }, viewer) => {
  const [items, total] = await Promise.all([
    MarketListing.find(filter).sort(sort).skip((pageNo - 1) * limit).limit(limit),
    MarketListing.countDocuments(filter),
  ]);
  return { items: await decorate(items, viewer), meta: buildMeta({ page: pageNo, limit, total }) };
};

/** Active (and sold or completed) listings are public. Hidden ones are for the owner and administrators. */
const publicVisible = (l) => !l.takenDown?.at && l.status !== 'inactive';
async function findVisible(id, viewer) {
  const listing = await MarketListing.findById(id);
  if (!listing) throw notFound();
  const privileged = viewer && (isAdmin(viewer) || idOf(listing.owner) === String(viewer._id));
  if (!publicVisible(listing) && !privileged) throw notFound();
  return listing;
}

// ---- publishing -----------------------------------------------------------------------------------------------------------
function assertCanPublish(user) {
  if (isStaff(user)) throw new AppError(403, 'Staff accounts cannot publish listings', 'STAFF_CANNOT_PUBLISH');
}

async function create(user, data) {
  assertCanPublish(user);
  const category = await loadCategory(data.category, data.kind);
  const details = checkDetails(category, data.details);

  let assets = [];
  if (data.mediaIds.length) {
    assets = await MediaAsset.find({ _id: { $in: data.mediaIds }, owner: user._id, attachedTo: { $exists: false } });
    if (assets.length !== data.mediaIds.length) throw new AppError(400, 'One of the photos or videos is not available. Upload it again.', 'INVALID_MEDIA');
    const claimed = await MediaAsset.updateMany({ _id: { $in: data.mediaIds }, owner: user._id, attachedTo: { $exists: false } }, { $set: { attachedTo: 'listing' } });
    if (claimed.modifiedCount !== assets.length) throw new AppError(400, 'One of the photos or videos is already in use', 'INVALID_MEDIA');
    const order = new Map(data.mediaIds.map((id, i) => [String(id), i]));
    assets.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
  }

  try {
    const listing = await MarketListing.create({
      owner: user._id,
      kind: data.kind,
      name: data.name,
      description: data.description,
      category: category._id,
      details,
      media: assets.map((a) => ({ asset: a._id, url: a.url, kind: a.kind, mime: a.mime, durationSeconds: a.durationSeconds })),
      location: { district: data.district, sector: data.sector },
      priceType: data.priceType,
      priceMin: data.priceMin,
      priceMax: data.priceMax,
      stock: data.stock,
      contactMethods: data.contactMethods,
      transactionOptions: data.transactionOptions,
      status: data.status,
    });
    return (await decorate([listing], user))[0];
  } catch (err) {
    if (assets.length) await MediaAsset.updateMany({ _id: { $in: assets.map((a) => a._id) } }, { $unset: { attachedTo: 1 } });
    throw err;
  }
}

async function findOwn(user, id) {
  const listing = await MarketListing.findById(id);
  if (!listing || idOf(listing.owner) !== String(user._id)) throw notFound(); // not yours: it does not exist for you
  return listing;
}

async function update(user, id, data) {
  const listing = await findOwn(user, id);
  const next = {
    priceType: data.priceType ?? listing.priceType,
    priceMin: 'priceMin' in data ? data.priceMin : listing.priceMin,
    priceMax: 'priceMax' in data ? data.priceMax : listing.priceMax,
  };
  // A change of price type must leave a price that still makes sense.
  if (next.priceType === 'fixed') { if (next.priceMin === undefined) throw new AppError(400, 'Enter the price', 'VALIDATION_ERROR'); next.priceMax = undefined; }
  if (next.priceType === 'range' && (next.priceMin === undefined || next.priceMax === undefined)) throw new AppError(400, 'Enter the lowest and the highest price', 'VALIDATION_ERROR');
  if (next.priceMin !== undefined && next.priceMax !== undefined && next.priceMin > next.priceMax) throw new AppError(400, 'The highest price cannot be lower than the lowest', 'VALIDATION_ERROR');

  if (data.category !== undefined || data.details !== undefined) {
    const category = await loadCategory(data.category ?? listing.category, listing.kind);
    listing.details = checkDetails(category, data.details ?? listing.details);
    listing.category = category._id;
  }
  if (data.name !== undefined) listing.name = data.name;
  if (data.description !== undefined) listing.description = data.description;
  if (data.district !== undefined) listing.location.district = data.district;
  if (data.sector !== undefined) listing.location.sector = data.sector;
  if (data.stock !== undefined) listing.stock = data.stock;
  if (data.contactMethods !== undefined) listing.contactMethods = data.contactMethods;
  if (data.transactionOptions !== undefined) listing.transactionOptions = data.transactionOptions;
  Object.assign(listing, next);
  await listing.save();
  return (await decorate([listing], user))[0];
}

async function setStatus(user, id, status) {
  const listing = await findOwn(user, id);
  if (listing.takenDown?.at) throw new AppError(403, 'An administrator has hidden this listing', 'LISTING_TAKEN_DOWN');
  listing.status = status;
  await listing.save();
  return (await decorate([listing], user))[0];
}

/** The owner deletes for good: the listing and its photos and videos. */
async function remove(user, id) {
  const listing = await findOwn(user, id);
  const assets = await MediaAsset.find({ _id: { $in: listing.media.map((m) => m.asset) } });
  await listing.deleteOne();
  await MediaAsset.deleteMany({ _id: { $in: assets.map((a) => a._id) } });
  await Promise.all(assets.map((a) => storage.remove(a.key)));
}

async function takeDown(admin, id, reason, ctx) {
  const listing = await MarketListing.findById(id);
  if (!listing) throw notFound();
  listing.takenDown = { at: new Date(), by: admin._id, reason };
  await listing.save();
  await audit.record({ actor: admin._id, action: 'listing.takedown', entityType: 'MarketListing', entityId: listing._id, metadata: { reason }, ctx, strict: true });
  await notifications.notify(listing.owner, { type: 'listing.moderated', title: 'Your listing was hidden', body: reason.slice(0, 200), link: `/dashboard/market/${listing._id}` });
  return (await decorate([listing], admin))[0];
}

async function restore(admin, id, ctx) {
  const listing = await MarketListing.findById(id);
  if (!listing) throw notFound();
  listing.takenDown = undefined;
  await listing.save();
  await audit.record({ actor: admin._id, action: 'listing.restore', entityType: 'MarketListing', entityId: listing._id, ctx, strict: true });
  return (await decorate([listing], admin))[0];
}

// ---- browsing -------------------------------------------------------------------------------------------------------------
async function get(id, viewer) {
  return (await decorate([await findVisible(id, viewer)], viewer))[0];
}

/**
 * Turns d[...] answers into database conditions using the category's own field definitions. select and yes/no match exactly, text
 * matches part of the answer, and a number field takes key_min and key_max. A name the category does not have is refused.
 */
async function detailConditions(categoryId, d) {
  const category = await ServiceCategory.findById(categoryId).select('requiredFields');
  const defs = new Map((category?.requiredFields ?? []).map((f) => [f.key, f]));
  const conditions = {};
  for (const [name, raw] of Object.entries(d)) {
    const range = /^(.+)_(min|max)$/.exec(name);
    const def = defs.get(name) ?? (range && defs.get(range[1])?.type === 'number' ? defs.get(range[1]) : undefined);
    if (!def) throw new AppError(400, `“${name}” is not a detail of this category`, 'INVALID_FILTER');
    const path = `details.${def.key}`;
    if (def.type === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new AppError(400, `“${def.label}” needs a number`, 'INVALID_FILTER');
      if (!range) conditions[path] = n;
      else conditions[path] = { ...(conditions[path] ?? {}), [range[2] === 'min' ? '$gte' : '$lte']: n };
    } else if (def.type === 'yes_no') {
      if (!['true', 'false'].includes(raw)) throw new AppError(400, `“${def.label}” must be true or false`, 'INVALID_FILTER');
      conditions[path] = raw === 'true';
    } else if (def.type === 'select') {
      if (!def.options.includes(raw)) throw new AppError(400, `“${raw}” is not an option for “${def.label}”`, 'INVALID_FILTER');
      conditions[path] = raw;
    } else {
      conditions[path] = new RegExp(escapeRegex(raw), 'i');
    }
  }
  return conditions;
}

async function browse(viewer, { q, kind, category, district, owner, minPrice, maxPrice, inStock, status, d, sort = 'newest', ...paging }) {
  // By default only what can still be bought; sold and completed listings are asked for with ?status=. Hidden ones never appear.
  const filter = { status: status ?? 'active', 'takenDown.at': { $exists: false } };
  if (kind) filter.kind = kind;
  if (category) filter.category = category;
  if (district) filter['location.district'] = district;
  if (owner) filter.owner = owner;
  if (minPrice !== undefined || maxPrice !== undefined) {
    // A listing matches when its price (or price range) overlaps the range asked for.
    const and = [];
    if (minPrice !== undefined) and.push({ $or: [{ priceMax: { $gte: minPrice } }, { priceMax: { $exists: false }, priceMin: { $gte: minPrice } }] });
    if (maxPrice !== undefined) and.push({ priceMin: { $lte: maxPrice } });
    filter.$and = and;
  }
  if (d) Object.assign(filter, await detailConditions(category, d));
  if (inStock) filter.$or = [{ 'stock.tracked': { $ne: true } }, { 'stock.quantity': { $gt: 0 } }];
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const textMatch = { $or: [{ name: rx }, { description: rx }] };
    filter.$and = [...(filter.$and || []), textMatch];
  }
  const order = { price_asc: { priceMin: 1, _id: 1 }, price_desc: { priceMin: -1, _id: -1 } }[sort] ?? { createdAt: -1, _id: -1 };
  return page(filter, order, paging, viewer);
}

function mine(user, { status, ...paging }) {
  return page({ owner: user._id, ...(status ? { status } : {}) }, { createdAt: -1, _id: -1 }, paging, user);
}

/** Two to four listings side by side. Only listings anyone can see are compared. */
async function compare(ids, viewer) {
  const found = await MarketListing.find({ _id: { $in: ids }, status: { $ne: 'inactive' }, 'takenDown.at': { $exists: false } });
  const byId = new Map(found.map((l) => [String(l._id), l]));
  const ordered = ids.map((id) => byId.get(String(id))).filter(Boolean);
  if (ordered.length < 2) throw new AppError(404, 'Those listings are not available to compare', 'LISTING_NOT_FOUND');
  return decorate(ordered, viewer);
}

async function save(user, id) {
  const listing = await findVisible(id, user);
  try { await ListingSave.create({ user: user._id, listing: listing._id }); } catch (err) { if (err.code !== 11000) throw err; }
  return { saved: true };
}

async function unsave(user, id) {
  await ListingSave.deleteOne({ user: user._id, listing: id });
  return { saved: false };
}

/** The listings you bookmarked, most recently saved first. Ones that were hidden or deleted since simply drop out. */
async function saved(user, { page: pageNo, limit }) {
  const [saves, total] = await Promise.all([
    ListingSave.find({ user: user._id }).sort({ createdAt: -1, _id: -1 }).skip((pageNo - 1) * limit).limit(limit),
    ListingSave.countDocuments({ user: user._id }),
  ]);
  const found = await MarketListing.find({ _id: { $in: saves.map((s) => s.listing) }, status: { $ne: 'inactive' }, 'takenDown.at': { $exists: false } });
  const byId = new Map(found.map((l) => [String(l._id), l]));
  const ordered = saves.map((s) => byId.get(String(s.listing))).filter(Boolean);
  return { items: await decorate(ordered, user), meta: buildMeta({ page: pageNo, limit, total }) };
}

module.exports = { save, unsave, saved, create, update, setStatus, remove, takeDown, restore, get, browse, mine, compare };
