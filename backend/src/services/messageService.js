const Block = require('../models/Block');
const Booking = require('../models/Booking');
const Conversation = require('../models/Conversation');
const MarketListing = require('../models/MarketListing');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const Post = require('../models/Post');
const Quotation = require('../models/Quotation');
const ProviderProfile = require('../models/ProviderProfile');
const ServiceRequest = require('../models/ServiceRequest');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const { buildMeta } = require('../utils/query');
const { isStaff } = require('../utils/roles');
const realtime = require('../utils/realtime');
const notifications = require('./notificationService');
const { authorsFor } = require('./postService');

const idOf = (v) => String(v?._id ?? v);
const isDuplicate = (err) => err?.code === 11000;
const notFound = () => new AppError(404, 'Conversation not found', 'CONVERSATION_NOT_FOUND');

// Contact details are shared through the platform once a job exists between two people. Until then a message may not carry them.
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const digitsIn = (text) => (text.match(/(?:\+?\d[\s().-]?){9,}/g) || []).length;
const hasContactDetails = (text) => EMAIL.test(text) || digitsIn(text) > 0 || /\b(whats\s?app|wa\.me|t\.me|telegram)\b/i.test(text);

async function haveJob(a, b) {
  return Boolean(await Booking.exists({ $or: [{ customer: a, providerUser: b }, { customer: b, providerUser: a }] }));
}

async function blockedEither(a, b) {
  return Block.exists({ $or: [{ blocker: a, blocked: b }, { blocker: b, blocked: a }] });
}

/** What a conversation is about. Only a subject the sender is allowed to see can be attached. */
async function resolveContext(user, context) {
  if (!context) return undefined;
  if (context.type === 'listing') {
    const l = await MarketListing.findOne({ _id: context.id, status: 'active', 'takenDown.at': { $exists: false } }).select('name');
    if (l) return { type: 'listing', id: l._id, title: l.name };
  } else if (context.type === 'post') {
    const p = await Post.findOne({ _id: context.id, status: 'active' }).select('caption');
    if (p) return { type: 'post', id: p._id, title: (p.caption || 'A post').slice(0, 80) };
  } else if (context.type === 'request') {
    const r = await ServiceRequest.findById(context.id).select('title customer');
    if (r) {
      const profile = await ProviderProfile.findOne({ user: user._id }).select('_id');
      const involved = idOf(r.customer) === String(user._id) || (profile && (await Quotation.exists({ request: r._id, provider: profile._id })));
      if (involved) return { type: 'request', id: r._id, title: r.title };
    }
  }
  throw new AppError(400, 'That subject is not available', 'INVALID_CONTEXT');
}

async function assertCanSend(user, other, text) {
  if (!other || other.status !== 'active' || isStaff(other)) throw new AppError(404, 'Account not found', 'USER_NOT_FOUND');
  if (await blockedEither(user._id, other._id)) throw new AppError(403, 'You cannot message this person', 'MESSAGING_BLOCKED');
  if (hasContactDetails(text) && !(await haveJob(user._id, other._id))) {
    throw new AppError(400, 'Phone numbers and email addresses can be shared after a job is agreed. Keep the conversation here until then.', 'CONTACT_DETAILS_NOT_ALLOWED');
  }
}

async function store(conversation, user, text) {
  const message = await Message.create({ conversation: conversation._id, sender: user._id, body: text });
  const now = message.createdAt;
  await Conversation.updateOne(
    { _id: conversation._id, 'members.user': user._id },
    { $set: { lastMessage: { body: text.slice(0, 200), sender: user._id, at: now }, 'members.$.lastReadAt': now } },
  );
  return message;
}

async function notifyRecipient(conversation, user, other, text) {
  const link = `/dashboard/messages/${conversation._id}`;
  // One unread notification per conversation, not one per message.
  if (!(await Notification.exists({ user: other._id, type: 'message.new', link, readAt: { $exists: false } }))) {
    await notifications.notify(other._id, { type: 'message.new', title: `New message from ${user.fullName}`, body: text.slice(0, 120), link });
  }
  // Open chats and the bell update at once. This comes after the notification exists, so a refresh finds it.
  realtime.publish(other._id, 'message', { conversationId: String(conversation._id) });
  realtime.publish(user._id, 'message', { conversationId: String(conversation._id) });
}

const toMessageJSON = (m, viewerId) => ({ id: String(m._id), conversation: idOf(m.conversation), sender: idOf(m.sender), body: m.removed ? '' : m.body, ...(m.removed ? { removed: true } : {}), createdAt: m.createdAt, mine: idOf(m.sender) === String(viewerId) });

async function findMine(user, id) {
  const conversation = await Conversation.findOne({ _id: id, 'members.user': user._id });
  if (!conversation) throw notFound();
  return conversation;
}

async function decorate(conversations, user) {
  const others = conversations.map((c) => c.members.find((m) => idOf(m.user) !== String(user._id))?.user);
  const [authors, unread, blocked] = await Promise.all([
    authorsFor(others.filter(Boolean)),
    Promise.all(conversations.map((c) => {
      const mine = c.members.find((m) => idOf(m.user) === String(user._id));
      return Message.countDocuments({ conversation: c._id, sender: { $ne: user._id }, createdAt: { $gt: mine?.lastReadAt ?? new Date(0) } });
    })),
    Block.find({ blocker: user._id, blocked: { $in: others.filter(Boolean) } }).distinct('blocked'),
  ]);
  const blockedSet = new Set(blocked.map(String));
  return conversations.map((c, i) => {
    const otherId = others[i] ? idOf(others[i]) : undefined;
    return {
      id: String(c._id),
      other: authors.get(otherId) ?? { id: otherId, fullName: 'Former member', type: 'customer' },
      ...(c.context?.type ? { context: { type: c.context.type, id: String(c.context.id), title: c.context.title } } : {}),
      ...(c.lastMessage?.at ? { lastMessage: { body: c.lastMessage.body, mine: idOf(c.lastMessage.sender) === String(user._id), at: c.lastMessage.at } } : {}),
      unread: unread[i],
      blockedByMe: blockedSet.has(otherId),
      updatedAt: c.updatedAt,
    };
  });
}

async function start(user, { userId, body, context }) {
  if (String(userId) === String(user._id)) throw new AppError(400, 'You cannot message yourself', 'CANNOT_MESSAGE_SELF');
  const other = await User.findById(userId).select('fullName roles status');
  await assertCanSend(user, other, body);
  const ctx = await resolveContext(user, context);

  const pairKey = Conversation.pairKeyOf(user._id, other._id);
  let conversation = await Conversation.findOne({ pairKey });
  if (!conversation) {
    try {
      conversation = await Conversation.create({ pairKey, members: [{ user: user._id }, { user: other._id }] });
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      conversation = await Conversation.findOne({ pairKey });
    }
  }
  if (ctx) await Conversation.updateOne({ _id: conversation._id }, { $set: { context: ctx } });
  const message = await store(conversation, user, body);
  await notifyRecipient(conversation, user, other, body);
  const fresh = await Conversation.findById(conversation._id);
  const [json] = await decorate([fresh], user);
  return { conversation: json, message: toMessageJSON(message, user._id) };
}

async function send(user, id, { body }) {
  const conversation = await findMine(user, id);
  const other = await User.findById(conversation.members.find((m) => idOf(m.user) !== String(user._id)).user).select('fullName roles status');
  await assertCanSend(user, other, body);
  const message = await store(conversation, user, body);
  await notifyRecipient(conversation, user, other, body);
  return toMessageJSON(message, user._id);
}

async function list(user, { page, limit }) {
  const filter = { 'members.user': user._id, 'lastMessage.at': { $exists: true } };
  const [items, total] = await Promise.all([
    Conversation.find(filter).sort({ 'lastMessage.at': -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    Conversation.countDocuments(filter),
  ]);
  return { items: await decorate(items, user), meta: buildMeta({ page, limit, total }) };
}

/** Newest page first (the app reverses it). Opening a conversation marks it read for the viewer. */
async function thread(user, id, { before, limit }) {
  const conversation = await findMine(user, id);
  const filter = { conversation: conversation._id, ...(before ? { _id: { $lt: before } } : {}) };
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1);
  const hasMore = rows.length > limit;
  const messages = rows.slice(0, limit).map((m) => toMessageJSON(m, user._id));
  await Conversation.updateOne({ _id: conversation._id, 'members.user': user._id }, { $set: { 'members.$.lastReadAt': new Date() } });
  await Notification.updateMany({ user: user._id, type: 'message.new', link: `/dashboard/messages/${conversation._id}`, readAt: { $exists: false } }, { $set: { readAt: new Date() } });
  const [json] = await decorate([conversation], user);
  return { conversation: json, messages, hasMore };
}

async function unreadTotal(user) {
  const conversations = await Conversation.find({ 'members.user': user._id, 'lastMessage.at': { $exists: true } }).select('members');
  const counts = await Promise.all(conversations.map((c) => {
    const mine = c.members.find((m) => idOf(m.user) === String(user._id));
    return Message.countDocuments({ conversation: c._id, sender: { $ne: user._id }, createdAt: { $gt: mine.lastReadAt } });
  }));
  return counts.reduce((a, b) => a + b, 0);
}

async function block(user, targetId) {
  if (String(targetId) === String(user._id)) throw new AppError(400, 'You cannot block yourself', 'CANNOT_BLOCK_SELF');
  const target = await User.findOne({ _id: targetId }).select('roles');
  if (!target || isStaff(target)) throw new AppError(404, 'Account not found', 'USER_NOT_FOUND');
  try { await Block.create({ blocker: user._id, blocked: target._id }); } catch (err) { if (!isDuplicate(err)) throw err; }
  return { blocked: true };
}

async function unblock(user, targetId) {
  await Block.deleteOne({ blocker: user._id, blocked: targetId });
  return { blocked: false };
}

module.exports = { start, send, list, thread, unreadTotal, block, unblock, hasContactDetails };
