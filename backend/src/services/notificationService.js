const Notification = require('../models/Notification');
const { typesOfCategory, CATEGORIES } = Notification;
const AppError = require('../utils/AppError');
const logger = require('../config/logger');

/**
 * Notifications are a side effect of something that already succeeded (a request was created, a quotation
 * accepted...), so a failure here is logged and swallowed. It must never undo or fail the main action.
 */
async function notify(userId, { type, title, body, link }) {
  try {
    await Notification.create({ user: userId, type, title, body, link });
  } catch (err) {
    logger.error({ err, type }, 'Failed to create notification');
  }
}

async function notifyMany(userIds, payload) {
  const unique = [...new Set(userIds.map(String))];
  if (unique.length === 0) return;
  try {
    await Notification.insertMany(unique.map((user) => ({ ...payload, user })), { ordered: false });
  } catch (err) {
    logger.error({ err, type: payload.type }, 'Failed to create notifications');
  }
}

async function list(user, { page, limit, unread, category }) {
  const filter = { user: user._id };
  if (unread) filter.readAt = { $exists: false };
  if (category) filter.type = { $in: typesOfCategory(category) };
  const [items, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: user._id, readAt: { $exists: false } }),
  ]);
  return { items, total, unreadCount };
}

const unreadCount = (user) => Notification.countDocuments({ user: user._id, readAt: { $exists: false } });

/** Unread numbers for each kind, so the app can show the quotation, message and other alerts apart. `total` is all three added up. */
async function unreadByCategory(user) {
  const counts = await Promise.all(CATEGORIES.map((c) => Notification.countDocuments({ user: user._id, readAt: { $exists: false }, type: { $in: typesOfCategory(c) } })));
  const byCategory = Object.fromEntries(CATEGORIES.map((c, i) => [c, counts[i]]));
  return { unreadCount: counts.reduce((a, b) => a + b, 0), byCategory };
}

/** Only the owner can mark a notification read; anyone else gets 404, as if it did not exist. */
async function markRead(user, id) {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, user: user._id },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  if (!notification) throw new AppError(404, 'Notification not found', 'NOTIFICATION_NOT_FOUND');
  return notification;
}

async function markAllRead(user, { category } = {}) {
  const filter = { user: user._id, readAt: { $exists: false } };
  if (category) filter.type = { $in: typesOfCategory(category) };
  const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
  return result.modifiedCount;
}

module.exports = { notify, notifyMany, list, unreadCount, unreadByCategory, markRead, markAllRead };
