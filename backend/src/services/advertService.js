const Advert = require('../models/Advert');
const AppError = require('../utils/AppError');
const storage = require('./storage');
const audit = require('./auditService');

const MAX_ADVERTS = 30;
const notFound = () => new AppError(404, 'Advert not found', 'ADVERT_NOT_FOUND');

/** What visitors see: active adverts that have not ended, in the order the super administrator set. */
const listPublic = () =>
  Advert.find({ status: 'active', $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }] })
    .sort({ sortOrder: 1, createdAt: -1 })
    .limit(MAX_ADVERTS);
const listAll = () => Advert.find({}).sort({ sortOrder: 1, createdAt: -1 }).limit(MAX_ADVERTS);

async function create(data, image, admin, ctx) {
  if ((await Advert.countDocuments()) >= MAX_ADVERTS) throw new AppError(409, `You can keep at most ${MAX_ADVERTS} adverts. Remove an old one first.`, 'ADVERT_LIMIT');
  const saved = await storage.save({ ...image, folder: 'adverts' });
  try {
    const advert = await Advert.create({ ...data, imageUrl: saved.url, imageKey: saved.key, createdBy: admin._id });
    await audit.record({ actor: admin._id, action: 'advert.create', entityType: 'Advert', entityId: advert._id, metadata: { title: advert.title }, ctx, strict: true });
    return advert;
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
}

async function update(id, data, admin, ctx) {
  const advert = await Advert.findById(id);
  if (!advert) throw notFound();
  const { text, linkUrl, expiresAt, ...rest } = data;
  Object.assign(advert, rest);
  if (text !== undefined) advert.text = text || undefined;
  if (linkUrl !== undefined) advert.linkUrl = linkUrl || undefined;
  if (expiresAt !== undefined) advert.expiresAt = expiresAt || undefined;
  await advert.save();
  await audit.record({ actor: admin._id, action: 'advert.update', entityType: 'Advert', entityId: advert._id, metadata: { fields: Object.keys(data) }, ctx, strict: true });
  return advert;
}

async function replaceImage(id, image, admin, ctx) {
  const advert = await Advert.findById(id);
  if (!advert) throw notFound();
  const saved = await storage.save({ ...image, folder: 'adverts' });
  const oldKey = advert.imageKey;
  try {
    advert.imageKey = saved.key;
    advert.imageUrl = saved.url;
    await advert.save();
    await audit.record({ actor: admin._id, action: 'advert.image_replace', entityType: 'Advert', entityId: advert._id, ctx, strict: true });
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
  await storage.remove(oldKey);
  return advert;
}

async function remove(id, admin, ctx) {
  const advert = await Advert.findByIdAndDelete(id);
  if (!advert) throw notFound();
  await storage.remove(advert.imageKey);
  await audit.record({ actor: admin._id, action: 'advert.delete', entityType: 'Advert', entityId: advert._id, metadata: { title: advert.title }, ctx, strict: true });
}

module.exports = { listPublic, listAll, create, update, replaceImage, remove };
