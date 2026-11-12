const Conversation = require('../models/Conversation');
const MarketListing = require('../models/MarketListing');
const Message = require('../models/Message');
const Post = require('../models/Post');
const PostComment = require('../models/PostComment');
const Report = require('../models/Report');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { buildMeta } = require('../utils/query');
const { isStaff } = require('../utils/roles');
const audit = require('./auditService');
const marketService = require('./marketService');
const notifications = require('./notificationService');

const idOf = (v) => String(v?._id ?? v);
const gone = () => new AppError(404, 'That item is not available to report', 'REPORT_TARGET_NOT_FOUND');
const cut = (text, n) => (text || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Finds what is being reported and checks the reporter could actually see it. Returns the owner, a snapshot and a link for staff. */
async function resolveTarget(user, type, id) {
  if (type === 'post') {
    const p = await Post.findOne({ _id: id, status: 'active' });
    if (!p) throw gone();
    return { owner: p.author, snapshot: cut(p.caption, 400) || '(photo or video only)', link: `/dashboard/feed/${p._id}` };
  }
  if (type === 'comment') {
    const c = await PostComment.findOne({ _id: id, status: 'active' });
    if (!c) throw gone();
    return { owner: c.author, snapshot: cut(c.body, 400), link: `/dashboard/feed/${c.post}` };
  }
  if (type === 'listing') {
    const l = await MarketListing.findOne({ _id: id, status: { $ne: 'inactive' }, 'takenDown.at': { $exists: false } });
    if (!l) throw gone();
    return { owner: l.owner, snapshot: cut(`${l.name}. ${l.description}`, 400), link: `/dashboard/market/${l._id}` };
  }
  if (type === 'message') {
    const m = await Message.findById(id);
    if (!m || m.removed) throw gone();
    // Only the other person in the chat can report a private message. Nobody else may even learn that it exists.
    const chat = await Conversation.findOne({ _id: m.conversation, 'members.user': user._id });
    if (!chat || idOf(m.sender) === String(user._id)) throw gone();
    return { owner: m.sender, snapshot: cut(m.body, 400), link: '' };
  }
  const u = await User.findOne({ _id: id, status: 'active' }).select('fullName roles');
  if (!u || isStaff(u) || idOf(u) === String(user._id)) throw gone();
  return { owner: u._id, snapshot: cut(u.fullName, 100), link: `/dashboard/people/${u._id}` };
}

async function create(user, { targetType, targetId, reason, details }) {
  const target = await resolveTarget(user, targetType, targetId);
  if (targetType !== 'user' && idOf(target.owner) === String(user._id)) throw new AppError(400, 'You cannot report your own content', 'CANNOT_REPORT_SELF');
  try {
    const report = await Report.create({ reporter: user._id, targetType, targetId, targetOwner: target.owner, reason, details, snapshot: target.snapshot, link: target.link });
    return { id: String(report._id), status: report.status };
  } catch (err) {
    if (err.code === 11000) throw new AppError(409, 'You have already reported this. A moderator will look at it.', 'ALREADY_REPORTED');
    throw err;
  }
}

// ---- moderators ----
async function list({ status, targetType, page, limit }) {
  const filter = { status, ...(targetType ? { targetType } : {}) };
  const [rows, total] = await Promise.all([
    Report.find(filter).sort(status === 'open' ? { createdAt: 1 } : { updatedAt: -1 }).skip((page - 1) * limit).limit(limit)
      .populate('reporter', 'fullName').populate('targetOwner', 'fullName status').populate('resolution.by', 'fullName'),
    Report.countDocuments(filter),
  ]);
  const counts = await Promise.all(rows.map((r) => Report.countDocuments({ targetType: r.targetType, targetId: r.targetId, status: 'open' })));
  const items = rows.map((r, i) => ({
    id: String(r._id),
    targetType: r.targetType,
    targetId: String(r.targetId),
    reason: r.reason,
    details: r.details,
    snapshot: r.snapshot,
    link: r.link || undefined,
    status: r.status,
    openReportsOnTarget: counts[i],
    reporter: r.reporter ? { id: idOf(r.reporter), fullName: r.reporter.fullName } : undefined,
    owner: r.targetOwner ? { id: idOf(r.targetOwner), fullName: r.targetOwner.fullName } : undefined,
    resolution: r.resolution?.action ? { action: r.resolution.action, note: r.resolution.note, at: r.resolution.at, by: r.resolution.by?.fullName } : undefined,
    createdAt: r.createdAt,
  }));
  return { items, meta: buildMeta({ page, limit, total }) };
}

async function removeTarget(admin, report, note, ctx) {
  const id = report.targetId;
  if (report.targetType === 'post') {
    const post = await Post.findOneAndUpdate({ _id: id, status: 'active' }, { $set: { status: 'removed' } });
    if (post) await audit.record({ actor: admin._id, action: 'post.remove', entityType: 'Post', entityId: id, metadata: { reportId: report._id, note }, ctx, strict: true });
  } else if (report.targetType === 'comment') {
    const c = await PostComment.findOneAndUpdate({ _id: id, status: 'active' }, { $set: { status: 'removed' } });
    if (c) {
      await Post.updateOne({ _id: c.post, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1, score: -2 } });
      await audit.record({ actor: admin._id, action: 'comment.remove', entityType: 'PostComment', entityId: id, metadata: { reportId: report._id, note }, ctx, strict: true });
    }
  } else if (report.targetType === 'listing') {
    const l = await MarketListing.findById(id).select('takenDown');
    if (l && !l.takenDown?.at) await marketService.takeDown(admin, id, note, ctx);
  } else if (report.targetType === 'message') {
    await Message.updateOne({ _id: id }, { $set: { removed: true } });
    await audit.record({ actor: admin._id, action: 'message.remove', entityType: 'Message', entityId: id, metadata: { reportId: report._id, note }, ctx, strict: true });
  }
}

/**
 * dismiss: nothing wrong. warn: the owner gets a notice, the content stays. remove: the content comes down and the owner is told.
 * Accounts are never removed from here; suspending someone stays a deliberate step on the users page.
 */
async function resolve(admin, id, { action, note }, ctx) {
  const report = await Report.findById(id);
  if (!report) throw new AppError(404, 'Report not found', 'REPORT_NOT_FOUND');
  if (report.status !== 'open') throw new AppError(409, 'This report was already handled', 'REPORT_ALREADY_HANDLED');
  if (action === 'remove' && report.targetType === 'user') throw new AppError(400, 'Accounts are not removed from here. Warn the person, or suspend them on the users page.', 'INVALID_ACTION');

  if (action === 'remove') await removeTarget(admin, report, note, ctx);

  const status = action === 'dismiss' ? 'dismissed' : 'actioned';
  const resolution = { action, note, by: admin._id, at: new Date() };
  // Everyone who reported the same thing gets the same outcome. A removal closes them all; a dismissal or warning closes just this one.
  const filter = action === 'remove' ? { targetType: report.targetType, targetId: report.targetId, status: 'open' } : { _id: report._id, status: 'open' };
  const open = await Report.find(filter).select('reporter');
  await Report.updateMany(filter, { $set: { status, resolution } });

  await audit.record({ actor: admin._id, action: `report.${action}`, entityType: 'Report', entityId: report._id, metadata: { targetType: report.targetType, targetId: String(report.targetId), note }, ctx, strict: true });
  await notifications.notifyMany(open.map((r) => r.reporter), { type: 'report.resolved', title: 'We looked at your report', body: action === 'dismiss' ? 'We did not find a problem, so nothing was changed.' : 'Thank you. We took action.', link: '/dashboard/notifications' });
  if (action !== 'dismiss' && report.targetOwner) {
    const what = { post: 'post', comment: 'comment', listing: 'listing', message: 'message', user: 'account' }[report.targetType];
    await notifications.notify(report.targetOwner, {
      type: 'moderation.notice',
      title: action === 'remove' ? `Your ${what} was removed` : `A warning about your ${what}`,
      body: note.slice(0, 200),
      link: '/dashboard/notifications',
    });
  }
  return { id: String(report._id), status };
}

const DAY = 24 * 3600 * 1000;

/** The numbers a moderator needs at a glance: what is waiting, how long it has waited, how fast reports get handled, who is reported most. */
async function summary() {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const since90 = new Date(now - 90 * DAY);
  const [byType, oldest, overDay, handled, top] = await Promise.all([
    Report.aggregate([{ $match: { status: 'open' } }, { $group: { _id: '$targetType', n: { $sum: 1 } } }]),
    Report.findOne({ status: 'open' }).sort({ createdAt: 1 }).select('createdAt'),
    Report.countDocuments({ status: 'open', createdAt: { $lt: new Date(now - DAY) } }),
    Report.aggregate([
      { $match: { status: { $ne: 'open' }, 'resolution.at': { $gte: since30 } } },
      { $group: { _id: '$resolution.action', n: { $sum: 1 }, ms: { $avg: { $subtract: ['$resolution.at', '$createdAt'] } } } },
    ]),
    Report.aggregate([
      { $match: { createdAt: { $gte: since90 }, targetOwner: { $exists: true } } },
      { $group: { _id: '$targetOwner', reports: { $sum: 1 }, actioned: { $sum: { $cond: [{ $eq: ['$status', 'actioned'] }, 1, 0] } } } },
      { $sort: { reports: -1, _id: 1 } },
      { $limit: 5 },
    ]),
  ]);
  const names = new Map((await User.find({ _id: { $in: top.map((t) => t._id) } }).select('fullName')).map((u) => [String(u._id), u.fullName]));
  const handledCount = handled.reduce((s, h) => s + h.n, 0);
  const avgMs = handledCount ? handled.reduce((s, h) => s + h.ms * h.n, 0) / handledCount : null;
  const open = byType.reduce((s, t) => s + t.n, 0);
  return {
    open,
    openByType: Object.fromEntries(byType.map((t) => [t._id, t.n])),
    oldestOpenAt: oldest?.createdAt,
    openOverOneDay: overDay,
    last30Days: {
      handled: handledCount,
      byAction: Object.fromEntries(handled.map((h) => [h._id, h.n])),
      averageHoursToHandle: avgMs === null ? null : Math.round((avgMs / 3600000) * 10) / 10,
    },
    mostReported: top.map((t) => ({ id: String(t._id), fullName: names.get(String(t._id)) ?? 'Former member', reports: t.reports, actioned: t.actioned })),
  };
}

module.exports = { create, list, resolve, summary };
