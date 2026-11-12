const Follow = require('../models/Follow');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { buildMeta } = require('../utils/query');
const { isStaff } = require('../utils/roles');
const notifications = require('./notificationService');
const { authorsFor } = require('./postService');

const isDuplicate = (err) => err?.code === 11000;

async function follow(user, targetId) {
  if (String(targetId) === String(user._id)) throw new AppError(400, 'You cannot follow yourself', 'CANNOT_FOLLOW_SELF');
  const target = await User.findOne({ _id: targetId, status: 'active' }).select('fullName roles');
  if (!target || isStaff(target)) throw new AppError(404, 'Account not found', 'USER_NOT_FOUND');
  let created = true;
  try {
    await Follow.create({ follower: user._id, following: target._id });
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    created = false;
  }
  if (created) await notifications.notify(target._id, { type: 'follow.new', title: `${user.fullName} started following you`, link: `/dashboard/people/${user._id}` });
  return stats(target._id, user);
}

async function unfollow(user, targetId) {
  await Follow.deleteOne({ follower: user._id, following: targetId });
  return stats(targetId, user);
}

async function stats(userId, viewer) {
  const [followers, following, followedByMe] = await Promise.all([
    Follow.countDocuments({ following: userId }),
    Follow.countDocuments({ follower: userId }),
    viewer ? Follow.exists({ follower: viewer._id, following: userId }) : null,
  ]);
  return { followers, following, followedByMe: Boolean(followedByMe) };
}

async function people(filter, populateField, { page, limit }) {
  const [rows, total] = await Promise.all([
    Follow.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Follow.countDocuments(filter),
  ]);
  const authors = await authorsFor(rows.map((r) => r[populateField]));
  return { items: rows.map((r) => authors.get(String(r[populateField]))).filter(Boolean), meta: buildMeta({ page, limit, total }) };
}

const listFollowing = (userId, paging) => people({ follower: userId }, 'following', paging);
const listFollowers = (userId, paging) => people({ following: userId }, 'follower', paging);

module.exports = { follow, unfollow, stats, listFollowing, listFollowers };
