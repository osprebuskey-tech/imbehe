const Advert = require('../models/Advert');
const AuditLog = require('../models/AuditLog');
const { api, bearer, createSession, createAdmin, attachPng, fileExists } = require('./helpers');

const superAdmin = () => createSession(['super_admin']);
const add = (token, fields = {}) => {
  let req = attachPng(api().post('/api/adverts').set(bearer(token)));
  for (const [k, v] of Object.entries({ title: 'Back to school offers', ...fields })) req = req.field(k, v);
  return req;
};
const inDays = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

describe('GET /api/adverts (public)', () => {
  test('shows only active adverts that have not ended, in order, without internal fields', async () => {
    const boss = await superAdmin();
    await add(boss.token, { title: 'Second advert', sortOrder: '2' });
    await add(boss.token, { title: 'First advert', sortOrder: '1' });
    const hidden = (await add(boss.token, { title: 'Hidden advert' })).body.data.advert;
    await api().put(`/api/adverts/${hidden.id}`).set(bearer(boss.token)).send({ status: 'hidden' });
    const ended = (await add(boss.token, { title: 'Ended advert', expiresAt: inDays(1) })).body.data.advert;
    await Advert.updateOne({ _id: ended.id }, { expiresAt: new Date(Date.now() - 1000) });

    const res = await api().get('/api/adverts');
    expect(res.status).toBe(200);
    expect(res.body.data.map((a) => a.title)).toEqual(['First advert', 'Second advert']);
    expect(res.body.data[0].imageUrl).toBeTruthy();
    expect(res.body.data[0]).not.toHaveProperty('imageKey');
  });
});

describe('managing adverts', () => {
  test('only the super administrator may add, change or remove them', async () => {
    const admin = await createAdmin();
    const customer = await createSession(['customer']);
    expect((await add(admin.token)).status).toBe(403);
    expect((await add(customer.token)).status).toBe(403);
    expect((await api().post('/api/adverts')).status).toBe(401);
    expect((await api().get('/api/adverts/manage').set(bearer(admin.token))).status).toBe(403);
  });

  test('adds an advert with a picture, link and end time, and audits it', async () => {
    const boss = await superAdmin();
    const res = await add(boss.token, { text: '20% off all week', linkUrl: 'https://example.com/offer', expiresAt: inDays(7) });
    expect(res.status).toBe(201);
    expect(res.body.data.advert).toMatchObject({ title: 'Back to school offers', text: '20% off all week', status: 'active' });
    expect(fileExists(res.body.data.advert.imageUrl)).toBe(true);
    expect(await AuditLog.countDocuments({ action: 'advert.create' })).toBe(1);
    expect((await api().get('/api/adverts/manage').set(bearer(boss.token))).body.data).toHaveLength(1);
  });

  test('rejects a missing picture, a non-image, an unsafe link and a past end time', async () => {
    const boss = await superAdmin();
    expect((await api().post('/api/adverts').set(bearer(boss.token)).field('title', 'No picture here')).status).toBe(400);
    const notImage = await api().post('/api/adverts').set(bearer(boss.token)).field('title', 'Not an image').attach('image', Buffer.from('plain text, not a picture'), { filename: 'x.png', contentType: 'image/png' });
    expect(notImage.status).toBe(400);
    expect((await add(boss.token, { linkUrl: 'javascript:alert(1)' })).status).toBe(400);
    expect((await add(boss.token, { expiresAt: inDays(-1) })).status).toBe(400);
  });

  test('edits, clears the link and end time, replaces the picture and removes the old file', async () => {
    const boss = await superAdmin();
    const created = (await add(boss.token, { linkUrl: 'https://example.com', expiresAt: inDays(3) })).body.data.advert;
    const edited = await api().put(`/api/adverts/${created.id}`).set(bearer(boss.token)).send({ title: 'New title', linkUrl: '', expiresAt: '' });
    expect(edited.status).toBe(200);
    expect(edited.body.data.advert.title).toBe('New title');
    expect(edited.body.data.advert.linkUrl).toBeUndefined();
    expect(edited.body.data.advert.expiresAt).toBeUndefined();

    const swapped = await attachPng(api().post(`/api/adverts/${created.id}/image`).set(bearer(boss.token)), 300);
    expect(swapped.status).toBe(200);
    expect(fileExists(created.imageUrl)).toBe(false);
    expect(fileExists(swapped.body.data.advert.imageUrl)).toBe(true);

    const gone = await api().delete(`/api/adverts/${created.id}`).set(bearer(boss.token));
    expect(gone.status).toBe(200);
    expect(fileExists(swapped.body.data.advert.imageUrl)).toBe(false);
    expect((await api().delete(`/api/adverts/${created.id}`).set(bearer(boss.token))).status).toBe(404);
  });
});
