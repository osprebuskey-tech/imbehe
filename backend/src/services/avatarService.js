const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const storage = require('./storage');
const audit = require('./auditService');

/**
 * One profile picture per person, whatever their role, and it can be changed or removed at any time.
 * A provider's public profile shows the same picture, so the provider record is kept pointing at the same file
 * (the user record is the owner of the file; both hold its key so older data keeps working).
 */
async function setAvatar(user, image, ctx) {
  const profile = await ProviderProfile.findOne({ user: user._id });
  const saved = await storage.save({ ...image, folder: 'avatars' });
  const oldKeys = new Set([user.avatarKey, profile?.avatarKey].filter(Boolean));
  try {
    user.avatarKey = saved.key;
    user.avatarUrl = saved.url;
    await user.save();
    if (profile) {
      profile.avatarKey = saved.key;
      profile.avatarUrl = saved.url;
      await profile.save();
    }
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
  await Promise.all([...oldKeys].filter((k) => k !== saved.key).map((k) => storage.remove(k)));
  await audit.record({ actor: user._id, action: 'auth.avatar_changed', entityType: 'User', entityId: user._id, ctx });
  return user;
}

async function removeAvatar(user, ctx) {
  const profile = await ProviderProfile.findOne({ user: user._id });
  const oldKeys = new Set([user.avatarKey, profile?.avatarKey].filter(Boolean));
  user.avatarKey = undefined;
  user.avatarUrl = undefined;
  await user.save();
  if (profile && (profile.avatarKey || profile.avatarUrl)) {
    profile.avatarKey = undefined;
    profile.avatarUrl = undefined;
    await profile.save();
  }
  await Promise.all([...oldKeys].map((k) => storage.remove(k)));
  await audit.record({ actor: user._id, action: 'auth.avatar_removed', entityType: 'User', entityId: user._id, ctx });
  return user;
}

/** The wide cover image on a profile page. Belongs to the account (not the provider profile), so every kind of account can have one. */
async function setCover(user, image, ctx) {
  const saved = await storage.save({ ...image, folder: 'covers' });
  const oldKey = user.coverKey;
  try {
    user.coverKey = saved.key;
    user.coverUrl = saved.url;
    await user.save();
  } catch (err) {
    await storage.remove(saved.key);
    throw err;
  }
  await storage.remove(oldKey);
  await audit.record({ actor: user._id, action: 'auth.cover_changed', entityType: 'User', entityId: user._id, ctx });
  return user;
}

async function removeCover(user, ctx) {
  const oldKey = user.coverKey;
  user.coverKey = undefined;
  user.coverUrl = undefined;
  await user.save();
  await storage.remove(oldKey);
  await audit.record({ actor: user._id, action: 'auth.cover_removed', entityType: 'User', entityId: user._id, ctx });
  return user;
}

module.exports = { setAvatar, removeAvatar, setCover, removeCover };
