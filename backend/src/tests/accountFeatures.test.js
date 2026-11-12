const Notification = require('../models/Notification');
const User = require('../models/User');
const { PASSWORD, api, bearer, register, createSession, createProvider, attachPng, fileExists } = require('./helpers');

describe('login with an email address or a phone number', () => {
  test('a Rwandan mobile number works in any common spelling', async () => {
    await register(); // phone 0788 123 456
    for (const phone of ['0788123456', '+250788123456', '250788123456', '0788 123 456']) {
      const res = await api().post('/api/auth/login').send({ phone, password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('aline@example.com');
    }
  });

  test('a wrong password or unknown number gives the same generic 401', async () => {
    await register();
    const wrong = await api().post('/api/auth/login').send({ phone: '0788123456', password: 'Wrong1234' });
    const unknown = await api().post('/api/auth/login').send({ phone: '0731111111', password: PASSWORD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  test('a number shared by two accounts cannot be used to sign in', async () => {
    await register();
    await register({ email: 'second@example.com' });
    const res = await api().post('/api/auth/login').send({ phone: '0788123456', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  test('sending both, or neither, is refused', async () => {
    await register();
    expect((await api().post('/api/auth/login').send({ email: 'aline@example.com', phone: '0788123456', password: PASSWORD })).status).toBe(400);
    expect((await api().post('/api/auth/login').send({ password: PASSWORD })).status).toBe(400);
  });
});

describe('profile picture for every account', () => {
  test('a customer can add, change and remove it at any time', async () => {
    const { token } = await createSession(['customer']);
    const first = await attachPng(api().post('/api/auth/me/avatar').set(bearer(token)));
    expect(first.status).toBe(200);
    const a = first.body.data.user.avatarUrl;
    expect(a).toMatch(/\/uploads\/avatars\//);
    expect(fileExists(a)).toBe(true);
    expect(JSON.stringify(first.body)).not.toMatch(/avatarKey/);

    const second = await attachPng(api().post('/api/auth/me/avatar').set(bearer(token)), 300);
    const b = second.body.data.user.avatarUrl;
    expect(b).not.toBe(a);
    expect(fileExists(a)).toBe(false);

    const me = await api().get('/api/auth/me').set(bearer(token));
    expect(me.body.data.user.avatarUrl).toBe(b);

    const removed = await api().delete('/api/auth/me/avatar').set(bearer(token));
    expect(removed.status).toBe(200);
    expect(removed.body.data.user.avatarUrl).toBeUndefined();
    expect(fileExists(b)).toBe(false);
  });

  test('rejects files that are not images, and needs a login', async () => {
    const { token } = await createSession(['customer']);
    const bad = await api().post('/api/auth/me/avatar').set(bearer(token)).attach('image', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);
    expect((await api().post('/api/auth/me/avatar')).status).toBe(401);
    expect((await api().delete('/api/auth/me/avatar')).status).toBe(401);
  });

  test('a provider’s public picture follows the account picture', async () => {
    const { token, user } = await createProvider();
    const up = await attachPng(api().post('/api/auth/me/avatar').set(bearer(token)));
    const url = up.body.data.user.avatarUrl;
    const mine = await api().get('/api/providers/me').set(bearer(token));
    expect(mine.body.data.profile.avatarUrl).toBe(url);
    await api().delete('/api/auth/me/avatar').set(bearer(token));
    const after = await api().get('/api/providers/me').set(bearer(token));
    expect(after.body.data.profile.avatarUrl).toBeUndefined();
    expect((await User.findById(user._id)).avatarUrl).toBeUndefined();
  });
});

describe('quotation, message and other notifications are kept apart', () => {
  const make = (user, type, extra = {}) => Notification.create({ user: user._id, type, title: type, ...extra });

  test('unread counts come back per kind', async () => {
    const me = await createSession(['customer']);
    await make(me.user, 'quotation.received');
    await make(me.user, 'quotation.updated');
    await make(me.user, 'message.new');
    await make(me.user, 'booking.updated');
    await make(me.user, 'quotation.accepted', { readAt: new Date() });
    const res = await api().get('/api/notifications/unread-count').set(bearer(me.token));
    expect(res.body.data).toEqual({ unreadCount: 4, byCategory: { quotation: 2, message: 1, general: 1 } });
  });

  test('the list can be filtered by kind and says which kind each one is', async () => {
    const me = await createSession(['customer']);
    await make(me.user, 'quotation.received');
    await make(me.user, 'message.new');
    await make(me.user, 'payment.updated');
    const q = await api().get('/api/notifications?category=quotation').set(bearer(me.token));
    expect(q.body.data.map((n) => n.type)).toEqual(['quotation.received']);
    expect(q.body.data[0].category).toBe('quotation');
    expect(q.body.meta.byCategory).toEqual({ quotation: 1, message: 1, general: 1 });
    const g = await api().get('/api/notifications?category=general').set(bearer(me.token));
    expect(g.body.data.map((n) => n.category)).toEqual(['general']);
    expect((await api().get('/api/notifications?category=nope').set(bearer(me.token))).status).toBe(400);
  });

  test('"mark all as read" can be limited to one kind', async () => {
    const me = await createSession(['customer']);
    await make(me.user, 'quotation.received');
    await make(me.user, 'message.new');
    const res = await api().post('/api/notifications/read-all').set(bearer(me.token)).send({ category: 'quotation' });
    expect(res.body.data.updated).toBe(1);
    const left = await api().get('/api/notifications/unread-count').set(bearer(me.token));
    expect(left.body.data.byCategory).toEqual({ quotation: 0, message: 1, general: 0 });
    const all = await api().post('/api/notifications/read-all').set(bearer(me.token));
    expect(all.body.data.updated).toBe(1);
  });
});

// ---- profile details, post-to-listing link, discovery --------------------------------------------------------------------
const MarketListing = require('../models/MarketListing');
const Follow = require('../models/Follow');
const ListingSave = require('../models/ListingSave');
const { createCategory } = require('./helpers');

const makeListing = async (owner, overrides = {}) => {
  const category = await createCategory({ kind: 'product' });
  return MarketListing.create({
    owner: owner._id, kind: 'product', name: 'Fresh avocados', description: 'Ripe avocados from Musanze, sold by the crate.',
    category: category._id, location: { district: 'Musanze' }, priceType: 'fixed', priceMin: 5000, ...overrides,
  });
};

describe('bio, district and cover image on every profile', () => {
  test('anyone can set a bio and home district, and clear them again', async () => {
    const { token, user } = await createSession(['customer']);
    const res = await api().patch('/api/auth/me').set(bearer(token)).send({ bio: 'I love good coffee.', district: 'Gasabo' });
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ bio: 'I love good coffee.', district: 'Gasabo' });
    const pub = await api().get(`/api/profiles/${user._id}`).set(bearer(token));
    expect(pub.body.data.profile).toMatchObject({ bio: 'I love good coffee.', district: 'Gasabo' });
    const cleared = await api().patch('/api/auth/me').set(bearer(token)).send({ bio: null, district: null });
    expect(cleared.body.data.user.bio).toBeUndefined();
    expect((await api().patch('/api/auth/me').set(bearer(token)).send({ district: 'Nowhere' })).status).toBe(400);
  });

  test('a cover image can be added, replaced and removed, and shows on the public profile', async () => {
    const { token, user } = await createSession(['business']);
    const one = await attachPng(api().post('/api/auth/me/cover').set(bearer(token)));
    expect(one.status).toBe(200);
    const a = one.body.data.user.coverUrl;
    expect(a).toMatch(/\/uploads\/covers\//);
    expect(JSON.stringify(one.body)).not.toMatch(/coverKey/);
    const two = await attachPng(api().post('/api/auth/me/cover').set(bearer(token)), 300);
    expect(fileExists(a)).toBe(false);
    const pub = await api().get(`/api/profiles/${user._id}`);
    expect(pub.body.data.profile.coverUrl).toBe(two.body.data.user.coverUrl);
    const gone = await api().delete('/api/auth/me/cover').set(bearer(token));
    expect(gone.body.data.user.coverUrl).toBeUndefined();
    expect(fileExists(two.body.data.user.coverUrl)).toBe(false);
  });

  test('the public profile shows the account picture for customers and businesses too', async () => {
    const { token, user } = await createSession(['business']);
    const up = await attachPng(api().post('/api/auth/me/avatar').set(bearer(token)));
    const pub = await api().get(`/api/profiles/${user._id}`);
    expect(pub.body.data.profile.avatarUrl).toBe(up.body.data.user.avatarUrl);
  });
});

describe('a post can promote one of your own listings', () => {
  const publish = (token, body) => api().post('/api/posts').set(bearer(token)).send(body);

  test('the post carries a summary of the listing', async () => {
    const { token, user } = await createSession(['business']);
    const listing = await makeListing(user);
    const res = await publish(token, { caption: 'Fresh this week', listingId: String(listing._id) });
    expect(res.status).toBe(201);
    expect(res.body.data.post.listing).toMatchObject({ id: String(listing._id), name: 'Fresh avocados', kind: 'product' });
  });

  test('someone else’s listing, or one that is switched off, is refused', async () => {
    const owner = await createSession(['business']);
    const other = await createSession(['business']);
    const theirs = await makeListing(owner.user);
    expect((await publish(other.token, { caption: 'mine now', listingId: String(theirs._id) })).status).toBe(400);
    const off = await makeListing(other.user, { status: 'inactive' });
    expect((await publish(other.token, { caption: 'inactive', listingId: String(off._id) })).status).toBe(400);
  });

  test('once the listing is sold the post stops offering it', async () => {
    const { token, user } = await createSession(['business']);
    const listing = await makeListing(user);
    const made = await publish(token, { caption: 'Fresh this week', listingId: String(listing._id) });
    await MarketListing.updateOne({ _id: listing._id }, { status: 'sold' });
    const seen = await api().get(`/api/posts/${made.body.data.post.id}`);
    expect(seen.body.data.post.listing).toBeUndefined();
  });
});

describe('GET /api/discover', () => {
  test('lists saved products, followed businesses and top-rated providers without any sign-in', async () => {
    const biz = await createSession(['business']);
    const fan = await createSession(['customer']);
    const hot = await makeListing(biz.user, { name: 'Hot item' });
    await makeListing(biz.user, { name: 'Quiet item' });
    await ListingSave.create({ user: fan.user._id, listing: hot._id });
    await Follow.create({ follower: fan.user._id, following: biz.user._id });
    const pro = await createProvider({ profileOverrides: { ratingAvg: 4.9, ratingCount: 12 } });
    await createProvider({ profileOverrides: { ratingAvg: 3.1, ratingCount: 2 } });
    await createProvider({ verified: false, profileOverrides: { ratingAvg: 5, ratingCount: 50 } });

    const res = await api().get('/api/discover');
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.trendingListings[0].name).toBe('Hot item');
    expect(d.popularBusinesses[0]).toMatchObject({ id: String(biz.user._id), followers: 1 });
    expect(d.topProviders.map((p) => p.id)).toHaveLength(2);
    expect(d.topProviders[0].id).toBe(String(pro.profile._id));
    expect(d.recentRequests).toEqual([]);
    expect(JSON.stringify(res.body)).not.toMatch(/phone|email/i);
  });

  test('taken-down listings never appear', async () => {
    const biz = await createSession(['business']);
    await makeListing(biz.user, { name: 'Hidden', takenDown: { at: new Date(), reason: 'fraud' } });
    const d = (await api().get('/api/discover')).body.data;
    expect(d.trendingListings.map((l) => l.name)).not.toContain('Hidden');
  });
});

describe('GET /api/posts/showcase (welcome page)', () => {
  test('shows only posts with media from verified people, with no private details', async () => {
    const verified = await createSession(['business']);
    await User.updateOne({ _id: verified.user._id }, { accountVerified: true });
    const plain = await createSession(['business']);
    const Post = require('../models/Post');
    const media = [{ asset: verified.user._id, url: 'http://x/a.png', kind: 'image' }];
    await Post.create({ author: verified.user._id, caption: 'Our new shop is open', media });
    await Post.create({ author: verified.user._id, caption: 'Text only post' });
    await Post.create({ author: plain.user._id, caption: 'Not verified', media });
    await Post.create({ author: verified.user._id, caption: 'Removed one', media, status: 'removed' });

    const res = await api().get('/api/posts/showcase');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p) => p.caption)).toEqual(['Our new shop is open']);
    expect(res.body.data[0].author).toMatchObject({ id: String(verified.user._id), verified: true });
    expect(res.body.data[0].media[0]).toEqual({ url: 'http://x/a.png', kind: 'image' });
    expect(JSON.stringify(res.body)).not.toMatch(/phone|email/i);
  });

  test('a suspended author’s posts are not shown', async () => {
    const verified = await createSession(['business']);
    await User.updateOne({ _id: verified.user._id }, { accountVerified: true, status: 'suspended' });
    const Post = require('../models/Post');
    await Post.create({ author: verified.user._id, caption: 'Hidden', media: [{ asset: verified.user._id, url: 'http://x/a.png', kind: 'image' }] });
    expect((await api().get('/api/posts/showcase')).body.data).toEqual([]);
  });
});
