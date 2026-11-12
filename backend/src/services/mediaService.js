const MediaAsset = require('../models/MediaAsset');
const AppError = require('../utils/AppError');

const invalid = (msg = 'One of the photos or videos is not available. Upload it again.') => new AppError(400, msg, 'INVALID_MEDIA');

/**
 * Takes ownership of uploaded files for one use (a request, a quotation...). Only the caller's own files that are not used yet can be
 * claimed, and each file is used once. Returns the assets in the order asked, shaped for storing on the record.
 */
async function claim(user, ids, attachedTo) {
  if (!ids?.length) return [];
  const assets = await MediaAsset.find({ _id: { $in: ids }, owner: user._id, attachedTo: { $exists: false } });
  if (assets.length !== ids.length) throw invalid();
  const claimed = await MediaAsset.updateMany({ _id: { $in: ids }, owner: user._id, attachedTo: { $exists: false } }, { $set: { attachedTo } });
  if (claimed.modifiedCount !== assets.length) throw invalid('One of the photos or videos is already in use');
  const order = new Map(ids.map((id, i) => [String(id), i]));
  return assets.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));
}

/** Puts claimed files back, when what they were claimed for could not be saved. */
const release = (assets) => (assets.length ? MediaAsset.updateMany({ _id: { $in: assets.map((a) => a._id) } }, { $unset: { attachedTo: 1 } }) : null);

const toStored = (assets) => assets.map((a) => ({ asset: a._id, url: a.url, kind: a.kind, mime: a.mime, durationSeconds: a.durationSeconds }));
const toPublic = (media = []) => media.map((m) => ({ url: m.url, kind: m.kind, ...(m.durationSeconds ? { durationSeconds: m.durationSeconds } : {}) }));

module.exports = { claim, release, toStored, toPublic };
