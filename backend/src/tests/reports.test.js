const Message = require('../models/Message');
const MarketListing = require('../models/MarketListing');
const Notification = require('../models/Notification');
const Post = require('../models/Post');
const PostComment = require('../models/PostComment');
const { api, bearer, createAdmin, createCategory, createSession, createProvider } = require('./helpers');

const report = (token, body) => api().post('/api/reports').set(bearer(token)).send({ reason: 'spam', ...body });
const queue = (token, query = '') => api().get(`/api/admin/moderation/reports${query}`).set(bearer(token));
const resolve = (token, id, body) => api().post(`/api/admin/moderation/reports/${id}/resolve`).set(bearer(token)).send(body);

async function world() {
  const category = await createCategory();
  const author = await createProvider({ profileOverrides: { categories: [category._id] } });
  const reporter = await createSession(['customer']);
  const admin = await createAdmin();
  const post = await Post.create({ author: author.user._id, caption: 'Buy cheap followers now!!!' });
  return { category, author, reporter, admin, post };
}

describe('reporting', () => {
  test('a member can report a post once; the second try is refused; you cannot report your own', async () => {
    const { author, reporter, post } = await world();
    const res = await report(reporter.token, { targetType: 'post', targetId: String(post._id), reason: 'scam', details: 'Fake offer' });
    expect(res.status).toBe(201);
    const again = await report(reporter.token, { targetType: 'post', targetId: String(post._id) });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_REPORTED');
    const own = await report(author.token, { targetType: 'post', targetId: String(post._id) });
    expect(own.status).toBe(400);
    expect(own.body.error.code).toBe('CANNOT_REPORT_SELF');
  });

  test('sign-in is required, and unknown, removed or invalid targets are refused', async () => {
    const { reporter, post } = await world();
    expect((await api().post('/api/reports').send({ targetType: 'post', targetId: String(post._id), reason: 'spam' })).status).toBe(401);
    expect((await report(reporter.token, { targetType: 'post', targetId: '64b000000000000000000000' })).status).toBe(404);
    await Post.updateOne({ _id: post._id }, { status: 'removed' });
    expect((await report(reporter.token, { targetType: 'post', targetId: String(post._id) })).status).toBe(404);
    expect((await report(reporter.token, { targetType: 'post', targetId: String(post._id), reason: 'dislike' })).status).toBe(400);
  });

  test('a private message can be reported only by the other person in that chat', async () => {
    const { author, reporter } = await world();
    const outsider = await createSession(['customer']);
    const chat = await api().post('/api/messages/conversations').set(bearer(author.token)).send({ userId: String(reporter.user._id), body: 'Send me money first' });
    const messageId = chat.body.data.message.id;
    expect((await report(outsider.token, { targetType: 'message', targetId: messageId })).status).toBe(404);
    expect((await report(author.token, { targetType: 'message', targetId: messageId })).status).toBe(404);
    expect((await report(reporter.token, { targetType: 'message', targetId: messageId, reason: 'scam' })).status).toBe(201);
  });

  test('staff accounts and yourself cannot be reported as accounts', async () => {
    const { admin, reporter } = await world();
    expect((await report(reporter.token, { targetType: 'user', targetId: String(admin.user._id) })).status).toBe(404);
    expect((await report(reporter.token, { targetType: 'user', targetId: String(reporter.user._id) })).status).toBe(404);
  });
});

describe('moderation queue', () => {
  test('only administrators can see or resolve reports', async () => {
    const { reporter, post } = await world();
    const r = (await report(reporter.token, { targetType: 'post', targetId: String(post._id) })).body.data.report;
    expect((await queue(reporter.token)).status).toBe(403);
    expect((await api().get('/api/admin/moderation/reports')).status).toBe(401);
    expect((await resolve(reporter.token, r.id, { action: 'dismiss' })).status).toBe(403);
  });

  test('the queue shows what was reported, who reported it, and how many others reported the same item', async () => {
    const { reporter, admin, post } = await world();
    const other = await createSession(['customer']);
    await report(reporter.token, { targetType: 'post', targetId: String(post._id), reason: 'scam' });
    await report(other.token, { targetType: 'post', targetId: String(post._id) });
    const res = await queue(admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.reports).toHaveLength(2);
    expect(res.body.data.reports[0]).toMatchObject({ targetType: 'post', snapshot: 'Buy cheap followers now!!!', openReportsOnTarget: 2, status: 'open' });
    expect(res.body.data.reports[0].reporter.fullName).toBeTruthy();
  });

  test('removing a post takes it down, closes every report on it, and tells the author and the reporters', async () => {
    const { author, reporter, admin, post } = await world();
    const other = await createSession(['customer']);
    const first = (await report(reporter.token, { targetType: 'post', targetId: String(post._id) })).body.data.report;
    await report(other.token, { targetType: 'post', targetId: String(post._id) });

    expect((await resolve(admin.token, first.id, { action: 'remove' })).status).toBe(400); // a note is required
    const done = await resolve(admin.token, first.id, { action: 'remove', note: 'Spam offer' });
    expect(done.status).toBe(200);
    expect((await Post.findById(post._id)).status).toBe('removed');
    expect((await queue(admin.token)).body.data.reports).toHaveLength(0);
    expect((await queue(admin.token, '?status=actioned')).body.data.reports).toHaveLength(2);
    expect(await Notification.countDocuments({ user: author.user._id, type: 'moderation.notice' })).toBe(1);
    expect(await Notification.countDocuments({ type: 'report.resolved' })).toBe(2);
    expect((await resolve(admin.token, first.id, { action: 'dismiss' })).status).toBe(409);
  });

  test('dismissing changes nothing and does not notify the author', async () => {
    const { author, reporter, admin, post } = await world();
    const r = (await report(reporter.token, { targetType: 'post', targetId: String(post._id) })).body.data.report;
    expect((await resolve(admin.token, r.id, { action: 'dismiss' })).status).toBe(200);
    expect((await Post.findById(post._id)).status).toBe('active');
    expect(await Notification.countDocuments({ user: author.user._id, type: 'moderation.notice' })).toBe(0);
    expect(await Notification.countDocuments({ user: reporter.user._id, type: 'report.resolved' })).toBe(1);
  });

  test('a warning notifies the owner and leaves the content up', async () => {
    const { author, reporter, admin, post } = await world();
    const r = (await report(reporter.token, { targetType: 'post', targetId: String(post._id) })).body.data.report;
    expect((await resolve(admin.token, r.id, { action: 'warn', note: 'Please do not post offers like this' })).status).toBe(200);
    expect((await Post.findById(post._id)).status).toBe('active');
    expect(await Notification.countDocuments({ user: author.user._id, type: 'moderation.notice' })).toBe(1);
  });

  test('removing a comment, a listing and a message each work; an account cannot be removed from here', async () => {
    const { category, author, reporter, admin, post } = await world();
    const comment = await PostComment.create({ post: post._id, author: author.user._id, body: 'visit my site' });
    await Post.updateOne({ _id: post._id }, { commentCount: 1 });
    const listing = await MarketListing.create({ owner: author.user._id, kind: 'service', category: category._id, name: 'Fake', description: 'Not real at all.', priceType: 'negotiable', status: 'active' });
    const chat = await api().post('/api/messages/conversations').set(bearer(author.token)).send({ userId: String(reporter.user._id), body: 'Pay me first' });

    const rc = (await report(reporter.token, { targetType: 'comment', targetId: String(comment._id) })).body.data.report;
    const rl = (await report(reporter.token, { targetType: 'listing', targetId: String(listing._id) })).body.data.report;
    const rm = (await report(reporter.token, { targetType: 'message', targetId: chat.body.data.message.id })).body.data.report;
    const ru = (await report(reporter.token, { targetType: 'user', targetId: String(author.user._id) })).body.data.report;

    for (const r of [rc, rl, rm]) expect((await resolve(admin.token, r.id, { action: 'remove', note: 'Breaks the rules' })).status).toBe(200);
    expect((await PostComment.findById(comment._id)).status).toBe('removed');
    expect((await Post.findById(post._id)).commentCount).toBe(0);
    expect((await MarketListing.findById(listing._id)).takenDown.at).toBeTruthy();
    expect((await Message.findById(chat.body.data.message.id)).removed).toBe(true);

    const thread = await api().get(`/api/messages/conversations/${chat.body.data.conversation.id}`).set(bearer(reporter.token));
    expect(thread.body.data.messages[0]).toMatchObject({ body: '', removed: true });

    const refused = await resolve(admin.token, ru.id, { action: 'remove', note: 'No' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('INVALID_ACTION');
    expect((await resolve(admin.token, ru.id, { action: 'warn', note: 'Final warning about scams' })).status).toBe(200);
  });
});

describe('moderation summary', () => {
  const summary = (token) => api().get('/api/admin/moderation/summary').set(bearer(token));

  test('counts what is waiting, how it was handled, and who is reported most; admins only', async () => {
    const { author, reporter, admin, post } = await world();
    const other = await createSession(['customer']);
    const second = await Post.create({ author: author.user._id, caption: 'Another spam post' });
    await report(reporter.token, { targetType: 'post', targetId: String(post._id) });
    await report(other.token, { targetType: 'post', targetId: String(post._id) });
    const r2 = (await report(reporter.token, { targetType: 'post', targetId: String(second._id) })).body.data.report;

    const before = (await summary(admin.token)).body.data.summary;
    expect(before).toMatchObject({ open: 3, openByType: { post: 3 }, openOverOneDay: 0 });
    expect(before.oldestOpenAt).toBeTruthy();
    expect(before.mostReported[0]).toMatchObject({ id: String(author.user._id), reports: 3, actioned: 0 });

    await resolve(admin.token, r2.id, { action: 'remove', note: 'Spam' });
    const after = (await summary(admin.token)).body.data.summary;
    expect(after.open).toBe(2);
    expect(after.last30Days).toMatchObject({ handled: 1, byAction: { remove: 1 } });
    expect(after.last30Days.averageHoursToHandle).toBeGreaterThanOrEqual(0);
    expect(after.mostReported[0].actioned).toBe(1);

    expect((await summary(reporter.token)).status).toBe(403);
    expect((await api().get('/api/admin/moderation/summary')).status).toBe(401);
  });

  test('an empty queue gives zeros, not errors', async () => {
    const admin = await createAdmin();
    const res = await summary(admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ open: 0, openOverOneDay: 0, mostReported: [], last30Days: { handled: 0, averageHoursToHandle: null } });
  });
});
