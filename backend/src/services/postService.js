const Post = require('../models/Post');
const PostLike = require('../models/PostLike');
const PostSave = require('../models/PostSave');
const PostComment = require('../models/PostComment');
const MediaAsset = require('../models/MediaAsset');
const MarketListing = require('../models/MarketListing');
const Follow = require('../models/Follow');
const User = require('../models/User');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceCategory = require('../models/ServiceCategory');
const AppError = require('../utils/AppError');
const { buildMeta, escapeRegex } = require('../utils/query');
const { isAdmin, isStaff } = require('../utils/roles');
const notifications = require('./notificationService');
const audit = require('./auditService');

const MAX_HASHTAGS = 10;
const notFound = () => new AppError(404, 'Post not found', 'POST_NOT_FOUND');
const idOf = (v) => String(v?._id ?? v);

/** #tags written in the caption, plus any given separately: lower case, no #, de-duplicated, at most ten. */
function collectHashtags(caption = '', extra = []) {
  const fromText = [...caption.matchAll(/#([\p{L}\p{N}_]{2,40})/gu)].map((m) => m[1].toLowerCase());
  return [...new Set([...fromText, ...extra])].slice(0, MAX_HASHTAGS);
}

// ---- how a post is shown ----------------------------------------------------------------------------------------------------
/** Public details of the people behind posts and comments: a name, a picture and what kind of account. Never contact details. */
async function authorsFor(userIds) {
  const ids = [...new Set(userIds.map(idOf))];
  if (ids.length === 0) return new Map();
  const [users, profiles] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('fullName roles avatarUrl'),
    ProviderProfile.find({ user: { $in: ids } }).select('user avatarUrl'),
  ]);
  const avatar = new Map(profiles.map((p) => [String(p.user), p.avatarUrl]));
  return new Map(
    users.map((u) => [
      String(u._id),
      {
        id: String(u._id),
        fullName: u.fullName,
        type: u.roles.includes('business') ? 'business' : u.roles.includes('provider') ? 'provider' : 'customer',
        ...(u.avatarUrl || avatar.get(String(u._id)) ? { avatarUrl: u.avatarUrl || avatar.get(String(u._id)) } : {}),
      },
    ]),
  );
}

async function decorate(posts, viewer) {
  if (posts.length === 0) return [];
  const postIds = posts.map((p) => p._id);
  const authorIds = posts.map((p) => p.author);
  const listingIds = posts.map((p) => p.listing).filter(Boolean);
  const [authors, liked, saved, following, listings] = await Promise.all([
    authorsFor(authorIds),
    viewer ? PostLike.find({ user: viewer._id, post: { $in: postIds } }).distinct('post') : [],
    viewer ? PostSave.find({ user: viewer._id, post: { $in: postIds } }).distinct('post') : [],
    viewer ? Follow.find({ follower: viewer._id, following: { $in: authorIds } }).distinct('following') : [],
    listingIds.length ? MarketListing.find({ _id: { $in: listingIds }, status: 'active', 'takenDown.at': { $exists: false } }).select('name kind media') : [],
  ]);
  const listingById = new Map(listings.map((l) => [String(l._id), l]));
  const likedSet = new Set(liked.map(String));
  const savedSet = new Set(saved.map(String));
  const followingSet = new Set(following.map(String));
  return posts.map((p) => {
    const json = p.toJSON();
    delete json.score;
    json.author = authors.get(idOf(p.author)) ?? { id: idOf(p.author), fullName: 'Former member', type: 'customer' };
    json.likedByMe = likedSet.has(String(p._id));
    json.savedByMe = savedSet.has(String(p._id));
    json.followingAuthor = followingSet.has(idOf(p.author));
    json.mine = Boolean(viewer && idOf(p.author) === String(viewer._id));
    // Only an active, visible listing is shown; if it was sold, switched off or taken down the post simply stops offering it.
    const promoted = p.listing ? listingById.get(idOf(p.listing)) : null;
    if (promoted) json.listing = { id: String(promoted._id), name: promoted.name, kind: promoted.kind, imageUrl: promoted.media.find((m) => m.kind === 'image')?.url };
    else delete json.listing;
    return json;
  });
}

const page = async (filter, sort, { page: pageNo, limit }, viewer) => {
  const [items, total] = await Promise.all([
    Post.find(filter).sort(sort).skip((pageNo - 1) * limit).limit(limit),
    Post.countDocuments(filter),
  ]);
  return { items: await decorate(items, viewer), meta: buildMeta({ page: pageNo, limit, total }) };
};

// ---- creating, reading, changing -----------------------------------------------------------------------------------------
async function create(user, data) {
  if (isStaff(user)) throw new AppError(403, 'Staff accounts cannot publish posts', 'STAFF_CANNOT_POST');

  if (data.category && !(await ServiceCategory.exists({ _id: data.category, status: 'active' }))) {
    throw new AppError(400, 'That category does not exist', 'CATEGORY_NOT_FOUND');
  }

  let listing;
  if (data.listingId) {
    listing = await MarketListing.findOne({ _id: data.listingId, owner: user._id, status: 'active', 'takenDown.at': { $exists: false } });
    if (!listing) throw new AppError(400, 'Choose one of your own active listings to promote', 'LISTING_NOT_FOUND');
  }

  let assets = [];
  if (data.mediaIds.length) {
    assets = await MediaAsset.find({ _id: { $in: data.mediaIds }, owner: user._id, attachedTo: { $exists: false } });
    if (assets.length !== data.mediaIds.length) throw new AppError(400, 'One of the photos or videos is not available. Upload it again.', 'INVALID_MEDIA');
    // Claim the files first, so the same upload cannot be attached to two posts by two quick requests.
    const claimed = await MediaAsset.updateMany({ _id: { $in: data.mediaIds }, owner: user._id, attachedTo: { $exists: false } }, { $set: { attachedTo: 'post' } });
    if (claimed.modifiedCount !== assets.length) throw new AppError(400, 'One of the photos or videos is already in use', 'INVALID_MEDIA');
  }
  const order = new Map(data.mediaIds.map((id, i) => [String(id), i]));
  assets.sort((a, b) => order.get(String(a._id)) - order.get(String(b._id)));

  try {
    const post = await Post.create({
      author: user._id,
      caption: data.caption || '',
      hashtags: collectHashtags(data.caption, data.hashtags),
      category: data.category,
      listing: listing?._id,
      location: data.district ? { district: data.district } : undefined,
      media: assets.map((a) => ({ asset: a._id, url: a.url, kind: a.kind, mime: a.mime, durationSeconds: a.durationSeconds })),
    });
    return (await decorate([post], user))[0];
  } catch (err) {
    if (assets.length) await MediaAsset.updateMany({ _id: { $in: assets.map((a) => a._id) } }, { $unset: { attachedTo: 1 } });
    throw err;
  }
}

/** Active posts are public. A removed post is visible only to its author and to administrators. */
async function findVisible(id, viewer) {
  const post = await Post.findById(id);
  if (!post) throw notFound();
  if (post.status !== 'active' && !(viewer && (isAdmin(viewer) || idOf(post.author) === String(viewer._id)))) throw notFound();
  return post;
}
const findActive = async (id) => {
  const post = await Post.findOne({ _id: id, status: 'active' });
  if (!post) throw notFound();
  return post;
};

async function get(id, viewer) {
  return (await decorate([await findVisible(id, viewer)], viewer))[0];
}

async function update(user, id, data) {
  const post = await Post.findById(id);
  if (!post || post.status !== 'active' || idOf(post.author) !== String(user._id)) throw notFound(); // not yours: it does not exist for you
  if (data.category) {
    if (!(await ServiceCategory.exists({ _id: data.category, status: 'active' }))) throw new AppError(400, 'That category does not exist', 'CATEGORY_NOT_FOUND');
  }
  if (data.caption !== undefined) post.caption = data.caption;
  if (data.caption !== undefined || data.hashtags !== undefined) post.hashtags = collectHashtags(post.caption, data.hashtags ?? []);
  if (data.category !== undefined) post.category = data.category ?? undefined;
  if (data.district !== undefined) post.location = data.district ? { district: data.district } : undefined;
  if (!post.caption && post.media.length === 0) throw new AppError(400, 'A post needs some text or a photo or video', 'VALIDATION_ERROR');
  await post.save();
  return (await decorate([post], user))[0];
}

async function remove(user, id, ctx) {
  const post = await Post.findById(id);
  if (!post || post.status !== 'active') throw notFound();
  const own = idOf(post.author) === String(user._id);
  if (!own && !isAdmin(user)) throw notFound();
  post.status = 'removed';
  await post.save();
  if (!own) await audit.record({ actor: user._id, action: 'post.remove', entityType: 'Post', entityId: post._id, ctx, strict: true });
}

// ---- feed, discovery, saved ----------------------------------------------------------------------------------------------
/** Posts from the people you follow, and your own, newest first. `following` tells the app whether to suggest discovery instead. */
async function feed(user, paging) {
  const followed = await Follow.find({ follower: user._id }).distinct('following');
  const result = await page({ status: 'active', author: { $in: [...followed, user._id] } }, { createdAt: -1, _id: -1 }, paging, user);
  return { ...result, following: followed.length };
}

/** Public discovery and search: by words, #hashtag, category, district, author, newest or trending. */
/**
 * The welcome page's showcase: the most popular recent posts with a picture or video, from people who are verified
 * (a provider whose profile is verified, or an account whose documents were verified). Only what a visitor may see: no counts that
 * need a login, no contact details.
 */
async function showcase(limit = 6) {
  const [providers, accounts] = await Promise.all([
    ProviderProfile.find({ verificationStatus: 'verified' }).distinct('user'),
    User.find({ accountVerified: true, status: 'active' }).distinct('_id'),
  ]);
  const verified = new Set([...providers.map(String), ...accounts.map(String)]);
  if (verified.size === 0) return [];
  const posts = await Post.find({ status: 'active', author: { $in: [...verified] }, 'media.0': { $exists: true } })
    .sort({ score: -1, createdAt: -1, _id: -1 })
    .limit(limit * 2);
  const authors = await authorsFor(posts.map((p) => p.author));
  const live = new Set((await User.find({ _id: { $in: [...authors.keys()] }, status: 'active' }).select('_id')).map((u) => String(u._id)));
  return posts
    .filter((p) => live.has(idOf(p.author)))
    .slice(0, limit)
    .map((p) => ({
      id: String(p._id),
      caption: p.caption.length > 140 ? `${p.caption.slice(0, 137)}…` : p.caption,
      media: p.media.slice(0, 1).map((m) => ({ url: m.url, kind: m.kind })),
      author: { ...authors.get(idOf(p.author)), verified: true },
      createdAt: p.createdAt,
    }));
}

function discover(viewer, { q, category, district, hashtag, author, sort = 'recent', ...paging }) {
  const filter = { status: 'active' };
  if (category) filter.category = category;
  if (district) filter['location.district'] = district;
  if (author) filter.author = author;
  if (hashtag) filter.hashtags = hashtag;
  if (q) {
    const rx = new RegExp(escapeRegex(q.replace(/^#/, '')), 'i');
    filter.$or = [{ caption: rx }, { hashtags: q.replace(/^#/, '').toLowerCase() }];
  }
  const order = sort === 'trending' ? { score: -1, createdAt: -1, _id: -1 } : { createdAt: -1, _id: -1 };
  return page(filter, order, paging, viewer);
}

async function saved(user, { page: pageNo, limit }) {
  const [rows, total] = await Promise.all([
    PostSave.find({ user: user._id }).sort({ createdAt: -1, _id: -1 }).skip((pageNo - 1) * limit).limit(limit),
    PostSave.countDocuments({ user: user._id }),
  ]);
  const posts = await Post.find({ _id: { $in: rows.map((r) => r.post) }, status: 'active' });
  const byId = new Map(posts.map((p) => [String(p._id), p]));
  const ordered = rows.map((r) => byId.get(String(r.post))).filter(Boolean);
  return { items: await decorate(ordered, user), meta: buildMeta({ page: pageNo, limit, total }) };
}

// ---- engagement ------------------------------------------------------------------------------------------------------------
const isDuplicate = (err) => err?.code === 11000;

async function react(Model, user, postId, { counter, weight, notify }) {
  const post = await findActive(postId);
  let created = true;
  try {
    await Model.create({ post: post._id, user: user._id });
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    created = false; // already done: doing it again changes nothing
  }
  let current = post;
  if (created) {
    current = await Post.findByIdAndUpdate(post._id, { $inc: { [counter]: 1, score: weight } }, { new: true });
    if (notify && idOf(post.author) !== String(user._id)) await notify(post, user);
  }
  return { value: true, count: current[counter] };
}

async function unreact(Model, user, postId, { counter, weight }) {
  const post = await findActive(postId);
  const { deletedCount } = await Model.deleteOne({ post: post._id, user: user._id });
  let current = post;
  if (deletedCount) current = await Post.findByIdAndUpdate(post._id, { $inc: { [counter]: -1, score: -weight } }, { new: true });
  return { value: false, count: Math.max(0, current[counter]) };
}

const LIKE = { counter: 'likeCount', weight: 1 };
const SAVE = { counter: 'saveCount', weight: 1 };

async function like(user, postId) {
  const r = await react(PostLike, user, postId, {
    ...LIKE,
    notify: (post, who) => notifications.notify(post.author, { type: 'post.liked', title: `${who.fullName} liked your post`, body: post.caption.slice(0, 120) || undefined, link: `/dashboard/feed/${post._id}` }),
  });
  return { liked: true, likeCount: r.count };
}
async function unlike(user, postId) {
  const r = await unreact(PostLike, user, postId, LIKE);
  return { liked: false, likeCount: r.count };
}
async function save(user, postId) {
  const r = await react(PostSave, user, postId, SAVE);
  return { saved: true, saveCount: r.count };
}
async function unsave(user, postId) {
  const r = await unreact(PostSave, user, postId, SAVE);
  return { saved: false, saveCount: r.count };
}

/** Counts a share and gives back the path to send around. */
async function share(user, postId) {
  const post = await findActive(postId);
  const updated = await Post.findByIdAndUpdate(post._id, { $inc: { shareCount: 1, score: 2 } }, { new: true });
  return { shareCount: updated.shareCount, path: `/dashboard/feed/${post._id}` };
}

// ---- comments --------------------------------------------------------------------------------------------------------------
async function addComment(user, postId, { body }) {
  const post = await findActive(postId);
  const comment = await PostComment.create({ post: post._id, author: user._id, body });
  await Post.updateOne({ _id: post._id }, { $inc: { commentCount: 1, score: 2 } });
  if (idOf(post.author) !== String(user._id)) {
    await notifications.notify(post.author, { type: 'post.commented', title: `${user.fullName} commented on your post`, body: body.slice(0, 120), link: `/dashboard/feed/${post._id}` });
  }
  return shapeComments([comment]).then((c) => c[0]);
}

async function shapeComments(comments) {
  const authors = await authorsFor(comments.map((c) => c.author));
  return comments.map((c) => {
    const json = c.toJSON();
    json.author = authors.get(idOf(c.author)) ?? { id: idOf(c.author), fullName: 'Former member', type: 'customer' };
    return json;
  });
}

async function listComments(viewer, postId, { page: pageNo, limit }) {
  const post = await findVisible(postId, viewer);
  const filter = { post: post._id, status: 'active' };
  const [items, total] = await Promise.all([
    PostComment.find(filter).sort({ createdAt: 1, _id: 1 }).skip((pageNo - 1) * limit).limit(limit),
    PostComment.countDocuments(filter),
  ]);
  return { items: await shapeComments(items), meta: buildMeta({ page: pageNo, limit, total }) };
}

/** A comment can be removed by whoever wrote it, by the author of the post it is on, or by an administrator. */
async function removeComment(user, postId, commentId, ctx) {
  const comment = await PostComment.findOne({ _id: commentId, post: postId, status: 'active' });
  if (!comment) throw new AppError(404, 'Comment not found', 'COMMENT_NOT_FOUND');
  const post = await Post.findById(postId);
  const own = idOf(comment.author) === String(user._id);
  const mine = post && idOf(post.author) === String(user._id);
  if (!own && !mine && !isAdmin(user)) throw new AppError(404, 'Comment not found', 'COMMENT_NOT_FOUND');
  comment.status = 'removed';
  await comment.save();
  await Post.updateOne({ _id: postId, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1, score: -2 } });
  if (!own && !mine) await audit.record({ actor: user._id, action: 'comment.remove', entityType: 'PostComment', entityId: comment._id, ctx, strict: true });
}

module.exports = { create, get, update, remove, feed, discover, showcase, saved, like, unlike, save, unsave, share, addComment, listComments, removeComment, authorsFor, collectHashtags };
