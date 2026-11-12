const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const Post = require('../models/Post');
const { api, bearer, createSession, createAdmin, createCategory, uploadMedia, mp4Buffer } = require('./helpers');

const publish = (token, body) => api().post('/api/posts').set(bearer(token)).send(body);
const post = async (token, body = { caption: 'Fresh work from today' }) => (await publish(token, body)).body.data.post;

describe('publishing a post', () => {
  test('a signed-in person publishes text with hashtags, a category and a district', async () => {
    const { token, user } = await createSession(['provider']);
    const category = await createCategory({ name: 'Design', slug: 'design' });
    const res = await publish(token, { caption: 'New logo for a cafe in #Kigali #Branding', hashtags: ['#logo', 'branding'], category: String(category._id), district: 'Gasabo' });
    expect(res.status).toBe(201);
    const p = res.body.data.post;
    expect(p).toMatchObject({ caption: 'New logo for a cafe in #Kigali #Branding', status: 'active', likeCount: 0, commentCount: 0, mine: true, likedByMe: false });
    expect(p.hashtags).toEqual(['kigali', 'branding', 'logo']);
    expect(p.location.district).toBe('Gasabo');
    expect(p.author).toMatchObject({ id: String(user._id), type: 'provider' });
    expect(p.author.email).toBeUndefined(); // contact details never appear on posts
    expect(p.score).toBeUndefined();
  });

  test('needs an account, a verified email, and some content', async () => {
    expect((await api().post('/api/posts').send({ caption: 'hi there' })).status).toBe(401);
    const { token } = await createSession(['customer']);
    expect((await publish(token, {})).status).toBe(400);
    expect((await publish(token, { caption: '   ' })).status).toBe(400);
    expect((await publish(token, { caption: 'ok', surprise: 1 })).status).toBe(400);
    const unverified = await createSession(['customer'], { emailVerified: false });
    expect((await publish(unverified.token, { caption: 'hello' })).body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  test('staff accounts cannot publish posts', async () => {
    const admin = await createAdmin();
    expect((await publish(admin.token, { caption: 'hello' })).body.error.code).toBe('STAFF_CANNOT_POST');
  });

  test('attaches uploaded photos and a short video, in order, and each file only once', async () => {
    const { token } = await createSession(['business']);
    const photo = await uploadMedia(token);
    const clip = await uploadMedia(token, { buffer: mp4Buffer(8), name: 'c.mp4', type: 'video/mp4' });
    const res = await publish(token, { caption: 'Our new shop', mediaIds: [clip.id, photo.id] });
    expect(res.status).toBe(201);
    expect(res.body.data.post.media.map((m) => m.kind)).toEqual(['video', 'image']);
    expect(res.body.data.post.media[0]).toMatchObject({ url: clip.url, durationSeconds: 8 });

    const again = await publish(token, { caption: 'Same photo again', mediaIds: [photo.id] });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_MEDIA');
  });

  test('cannot attach someone else\'s upload, or a made-up id; a video over 10 seconds never becomes media at all', async () => {
    const a = await createSession(['customer']);
    const b = await createSession(['customer']);
    const theirs = await uploadMedia(a.token);
    expect((await publish(b.token, { caption: 'stolen', mediaIds: [theirs.id] })).body.error.code).toBe('INVALID_MEDIA');
    expect((await publish(b.token, { caption: 'invented', mediaIds: ['64b64b64b64b64b64b64b64b'] })).body.error.code).toBe('INVALID_MEDIA');
    expect((await publish(b.token, { caption: 'url instead of id', mediaIds: ['http://evil.example/x.mp4'] })).status).toBe(400);
    const tooLong = await api().post('/api/media').set(bearer(b.token)).attach('media', mp4Buffer(11), { filename: 'long.mp4', contentType: 'video/mp4' });
    expect(tooLong.body.error.code).toBe('VIDEO_TOO_LONG');
  });

  test('rejects an unknown category and more than six files', async () => {
    const { token } = await createSession(['customer']);
    expect((await publish(token, { caption: 'x y', category: '64b64b64b64b64b64b64b64b' })).body.error.code).toBe('CATEGORY_NOT_FOUND');
    const disabled = await createCategory({ name: 'Old', slug: 'old', status: 'disabled' });
    expect((await publish(token, { caption: 'x y', category: String(disabled._id) })).status).toBe(400);
    const ids = Array.from({ length: 7 }, (_, i) => `64b64b64b64b64b64b64b64${i}`.slice(0, 24));
    expect((await publish(token, { caption: 'too many', mediaIds: ids })).status).toBe(400);
  });
});

describe('reading, editing and removing posts', () => {
  test('anyone can read a post, and the owner can edit it; nobody else can', async () => {
    const owner = await createSession(['provider']);
    const other = await createSession(['customer']);
    const p = await post(owner.token, { caption: 'First version #one' });
    expect((await api().get(`/api/posts/${p.id}`)).body.data.post.caption).toBe('First version #one');

    const edited = await api().put(`/api/posts/${p.id}`).set(bearer(owner.token)).send({ caption: 'Second version #two' });
    expect(edited.body.data.post.hashtags).toEqual(['two']);
    expect((await api().put(`/api/posts/${p.id}`).set(bearer(other.token)).send({ caption: 'hacked' })).status).toBe(404);
    expect((await api().put(`/api/posts/${p.id}`).set(bearer(owner.token)).send({})).status).toBe(400);
  });

  test('a removed post disappears for the public but not for its author or an administrator, and an admin removal is audited', async () => {
    const owner = await createSession(['provider']);
    const admin = await createAdmin();
    const p = await post(owner.token);
    const removed = await api().delete(`/api/posts/${p.id}`).set(bearer(admin.token));
    expect(removed.status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'post.remove' })).toBe(1);

    expect((await api().get(`/api/posts/${p.id}`)).status).toBe(404);
    expect((await api().get(`/api/posts/${p.id}`).set(bearer(owner.token))).status).toBe(200);
    expect((await api().get(`/api/posts/${p.id}`).set(bearer(admin.token))).status).toBe(200);
    expect((await api().get('/api/posts')).body.data).toHaveLength(0);

    const own = await post(owner.token);
    expect((await api().delete(`/api/posts/${own.id}`).set(bearer(owner.token))).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'post.remove' })).toBe(1); // removing your own post is not a moderation event
    const stranger = await createSession(['customer']);
    const third = await post(owner.token);
    expect((await api().delete(`/api/posts/${third.id}`).set(bearer(stranger.token))).status).toBe(404);
  });
});

describe('feed and discovery', () => {
  test('the feed shows posts from people you follow, and your own, newest first', async () => {
    const me = await createSession(['customer']);
    const followed = await createSession(['provider']);
    const stranger = await createSession(['provider']);
    await post(followed.token, { caption: 'from someone I follow' });
    await post(stranger.token, { caption: 'from a stranger' });
    await post(me.token, { caption: 'my own post' });

    let feed = await api().get('/api/posts/feed').set(bearer(me.token));
    expect(feed.body.data.map((p) => p.caption)).toEqual(['my own post']);
    expect(feed.body.meta.following).toBe(0); // the app uses this to suggest discovery

    await api().post(`/api/follows/${followed.user._id}`).set(bearer(me.token));
    feed = await api().get('/api/posts/feed').set(bearer(me.token));
    expect(feed.body.data.map((p) => p.caption)).toEqual(['my own post', 'from someone I follow']);
    expect(feed.body.data[1].followingAuthor).toBe(true);
    expect(feed.body.meta.following).toBe(1);
    expect((await api().get('/api/posts/feed')).status).toBe(401);
  });

  test('discovery is public and filters by words, hashtag, category, district and author', async () => {
    const a = await createSession(['provider']);
    const b = await createSession(['business']);
    const design = await createCategory({ name: 'Design', slug: 'design' });
    await post(a.token, { caption: 'Logo for a bakery #branding', category: String(design._id), district: 'Gasabo' });
    await post(b.token, { caption: 'Fresh vegetables today', district: 'Huye' });

    const get = (qs) => api().get(`/api/posts?${qs}`);
    expect((await get('q=bakery')).body.data).toHaveLength(1);
    expect((await get('q=%23branding')).body.data).toHaveLength(1); // "#branding" typed in the search box
    expect((await get('hashtag=branding')).body.data).toHaveLength(1);
    expect((await get(`category=${design._id}`)).body.data).toHaveLength(1);
    expect((await get('district=Huye')).body.data.map((p) => p.caption)).toEqual(['Fresh vegetables today']);
    expect((await get(`author=${b.user._id}`)).body.data).toHaveLength(1);
    expect((await get('q=nothing-matches-this')).body.data).toHaveLength(0);
    expect((await get('q=a')).status).toBe(400);
    expect((await get('district=Atlantis')).status).toBe(400);
    expect((await get('')).body.meta).toMatchObject({ total: 2, page: 1 });
  });

  test('regular-expression characters in a search are treated as plain text', async () => {
    const a = await createSession(['provider']);
    await post(a.token, { caption: 'Price (negotiable) [RWF]' });
    expect((await api().get('/api/posts?q=(negotiable)')).body.data).toHaveLength(1);
    expect((await api().get('/api/posts?q=.*')).body.data).toHaveLength(0);
  });

  test('trending puts the most engaged posts first', async () => {
    const author = await createSession(['provider']);
    const fan = await createSession(['customer']);
    const quiet = await post(author.token, { caption: 'a quiet post' });
    const busy = await post(author.token, { caption: 'a busy post' });
    await api().post(`/api/posts/${busy.id}/like`).set(bearer(fan.token));
    await api().post(`/api/posts/${busy.id}/comments`).set(bearer(fan.token)).send({ body: 'great' });
    const res = await api().get('/api/posts?sort=trending');
    expect(res.body.data.map((p) => p.id)).toEqual([busy.id, quiet.id]);
  });

  test('shows whether the viewer liked and saved each post', async () => {
    const author = await createSession(['provider']);
    const me = await createSession(['customer']);
    const p = await post(author.token);
    await api().post(`/api/posts/${p.id}/like`).set(bearer(me.token));
    await api().post(`/api/posts/${p.id}/save`).set(bearer(me.token));
    const mine = (await api().get('/api/posts').set(bearer(me.token))).body.data[0];
    expect(mine).toMatchObject({ likedByMe: true, savedByMe: true, mine: false });
    expect((await api().get('/api/posts')).body.data[0]).toMatchObject({ likedByMe: false, savedByMe: false });
  });
});

describe('likes, saves and shares', () => {
  test('liking is idempotent, counts once, can be undone, and tells the author', async () => {
    const author = await createSession(['provider']);
    const fan = await createSession(['customer']);
    const p = await post(author.token);
    const like = () => api().post(`/api/posts/${p.id}/like`).set(bearer(fan.token));
    expect((await like()).body.data).toEqual({ liked: true, likeCount: 1 });
    expect((await like()).body.data).toEqual({ liked: true, likeCount: 1 });
    expect(await Notification.countDocuments({ user: author.user._id, type: 'post.liked' })).toBe(1);

    expect((await api().delete(`/api/posts/${p.id}/like`).set(bearer(fan.token))).body.data).toEqual({ liked: false, likeCount: 0 });
    expect((await api().delete(`/api/posts/${p.id}/like`).set(bearer(fan.token))).body.data.likeCount).toBe(0); // never below zero
  });

  test('liking your own post sends you no notification; two quick taps still count once', async () => {
    const author = await createSession(['provider']);
    const p = await post(author.token);
    await Promise.all([1, 2, 3].map(() => api().post(`/api/posts/${p.id}/like`).set(bearer(author.token))));
    expect((await Post.findById(p.id)).likeCount).toBe(1);
    expect(await Notification.countDocuments({ type: 'post.liked' })).toBe(0);
  });

  test('saving builds a private list of saved posts', async () => {
    const author = await createSession(['provider']);
    const me = await createSession(['customer']);
    const a = await post(author.token, { caption: 'first' });
    const b = await post(author.token, { caption: 'second' });
    await api().post(`/api/posts/${a.id}/save`).set(bearer(me.token));
    await api().post(`/api/posts/${b.id}/save`).set(bearer(me.token));
    expect((await api().get('/api/posts/saved').set(bearer(me.token))).body.data.map((p) => p.caption)).toEqual(['second', 'first']);
    await api().delete(`/api/posts/${a.id}/save`).set(bearer(me.token));
    expect((await api().get('/api/posts/saved').set(bearer(me.token))).body.data).toHaveLength(1);
    expect((await api().get('/api/posts/saved').set(bearer(author.token))).body.data).toHaveLength(0);
  });

  test('sharing counts and returns a path; none of it works on a removed post', async () => {
    const author = await createSession(['provider']);
    const me = await createSession(['customer']);
    const p = await post(author.token);
    const shared = await api().post(`/api/posts/${p.id}/share`).set(bearer(me.token));
    expect(shared.body.data).toEqual({ shareCount: 1, path: `/dashboard/feed/${p.id}` });
    await api().delete(`/api/posts/${p.id}`).set(bearer(author.token));
    expect((await api().post(`/api/posts/${p.id}/like`).set(bearer(me.token))).status).toBe(404);
    expect((await api().post(`/api/posts/${p.id}/share`).set(bearer(me.token))).status).toBe(404);
  });
});

describe('comments', () => {
  test('a comment is listed with its author, counted, and notified to the post author', async () => {
    const author = await createSession(['provider']);
    const me = await createSession(['customer']);
    const p = await post(author.token);
    const res = await api().post(`/api/posts/${p.id}/comments`).set(bearer(me.token)).send({ body: 'Lovely work!' });
    expect(res.status).toBe(201);
    expect(res.body.data.comment).toMatchObject({ body: 'Lovely work!', author: { id: String(me.user._id) } });
    const list = await api().get(`/api/posts/${p.id}/comments`);
    expect(list.body.data).toHaveLength(1);
    expect((await api().get(`/api/posts/${p.id}`)).body.data.post.commentCount).toBe(1);
    expect(await Notification.countDocuments({ user: author.user._id, type: 'post.commented' })).toBe(1);
    expect((await api().post(`/api/posts/${p.id}/comments`).send({ body: 'anon' })).status).toBe(401);
    expect((await api().post(`/api/posts/${p.id}/comments`).set(bearer(me.token)).send({ body: '  ' })).status).toBe(400);
  });

  test('can be removed by its writer, the post author or an administrator, but not by another member', async () => {
    const author = await createSession(['provider']);
    const writer = await createSession(['customer']);
    const other = await createSession(['customer']);
    const admin = await createAdmin();
    const p = await post(author.token);
    const add = async () => (await api().post(`/api/posts/${p.id}/comments`).set(bearer(writer.token)).send({ body: 'a comment' })).body.data.comment.id;
    const del = (token, id) => api().delete(`/api/posts/${p.id}/comments/${id}`).set(bearer(token));

    const c1 = await add();
    expect((await del(other.token, c1)).status).toBe(404);
    expect((await del(writer.token, c1)).status).toBe(200);
    const c2 = await add();
    expect((await del(author.token, c2)).status).toBe(200);
    const c3 = await add();
    expect((await del(admin.token, c3)).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'comment.remove' })).toBe(1);
    expect((await api().get(`/api/posts/${p.id}/comments`)).body.data).toHaveLength(0);
    expect((await Post.findById(p.id)).commentCount).toBe(0);
  });
});

describe('following', () => {
  test('follow, count, list and unfollow, with a notification the first time only', async () => {
    const me = await createSession(['customer']);
    const shop = await createSession(['business']);
    const follow = () => api().post(`/api/follows/${shop.user._id}`).set(bearer(me.token));
    expect((await follow()).body.data).toEqual({ followers: 1, following: 0, followedByMe: true });
    expect((await follow()).body.data.followers).toBe(1);
    expect(await Notification.countDocuments({ user: shop.user._id, type: 'follow.new' })).toBe(1);

    const stats = await api().get(`/api/follows/${shop.user._id}/stats`).set(bearer(me.token));
    expect(stats.body.data).toMatchObject({ followers: 1, followedByMe: true });
    expect((await api().get(`/api/follows/${shop.user._id}/stats`)).body.data.followedByMe).toBe(false);

    const followers = await api().get(`/api/follows/${shop.user._id}/followers`);
    expect(followers.body.data).toEqual([expect.objectContaining({ id: String(me.user._id), fullName: me.user.fullName })]);
    expect(followers.body.data[0].email).toBeUndefined();
    expect((await api().get(`/api/follows/${me.user._id}/following`)).body.data[0].id).toBe(String(shop.user._id));

    expect((await api().delete(`/api/follows/${shop.user._id}`).set(bearer(me.token))).body.data.followers).toBe(0);
  });

  test('you cannot follow yourself, staff, or someone who does not exist', async () => {
    const me = await createSession(['customer']);
    const admin = await createAdmin();
    expect((await api().post(`/api/follows/${me.user._id}`).set(bearer(me.token))).body.error.code).toBe('CANNOT_FOLLOW_SELF');
    expect((await api().post(`/api/follows/${admin.user._id}`).set(bearer(me.token))).status).toBe(404);
    expect((await api().post('/api/follows/64b64b64b64b64b64b64b64b').set(bearer(me.token))).status).toBe(404);
    expect((await api().post(`/api/follows/${me.user._id}`)).status).toBe(401);
  });
});
