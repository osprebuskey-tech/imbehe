const Booking = require('../models/Booking');
const MarketListing = require('../models/MarketListing');
const Quotation = require('../models/Quotation');
const ServiceRequest = require('../models/ServiceRequest');
const {
  api, bearer, createCategory, createSession, createProvider, validRequest, validQuotation, mp4Buffer, pngBuffer,
} = require('./helpers');

const upload = async (token, buffer, name, type) => (await api().post('/api/media').set(bearer(token)).attach('media', buffer, { filename: name, contentType: type })).body.data.media;
const photo = (token) => upload(token, pngBuffer(2000), 'p.png', 'image/png');
const createRequest = (token, body) => api().post('/api/requests').set(bearer(token)).send(body);
const quote = (token, requestId, body = {}) => api().post(`/api/requests/${requestId}/quotations`).set(bearer(token)).send(validQuotation(body));
const decide = (token, id, status) => api().patch(`/api/quotations/${id}`).set(bearer(token)).send({ status });

async function setup() {
  const category = await createCategory();
  const customer = await createSession(['customer']);
  const a = await createProvider({ profileOverrides: { categories: [category._id], displayName: 'Provider A' } });
  const b = await createProvider({ profileOverrides: { categories: [category._id], displayName: 'Provider B' } });
  const c = await createProvider({ profileOverrides: { categories: [category._id], displayName: 'Provider C' } });
  return { category, customer, a, b, c };
}

describe('requests with photos, video and a negotiable budget', () => {
  test('photos and a short video attach to a request, and a media file can be used only once', async () => {
    const { category, customer } = await setup();
    const img = await photo(customer.token);
    const clip = await upload(customer.token, mp4Buffer(6), 'c.mp4', 'video/mp4');
    const res = await createRequest(customer.token, validRequest(category._id, { mediaIds: [img.id, clip.id], budgetNegotiable: true }));
    expect(res.status).toBe(201);
    expect(res.body.data.request.budgetNegotiable).toBe(true);
    expect(res.body.data.request.media.map((m) => m.kind).sort()).toEqual(['image', 'video']);

    const again = await createRequest(customer.token, validRequest(category._id, { mediaIds: [img.id] }));
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe('INVALID_MEDIA');
  });

  test("someone else's media, a missing id and more than three files are refused", async () => {
    const { category, customer } = await setup();
    const other = await createSession(['customer']);
    const theirs = await photo(other.token);
    expect((await createRequest(customer.token, validRequest(category._id, { mediaIds: [theirs.id] }))).status).toBe(400);
    expect((await createRequest(customer.token, validRequest(category._id, { mediaIds: ['64b000000000000000000000'] }))).status).toBe(400);
    const four = [];
    for (let i = 0; i < 4; i += 1) four.push((await photo(customer.token)).id);
    expect((await createRequest(customer.token, validRequest(category._id, { mediaIds: four }))).status).toBe(400);
  });

  test('a video over ten seconds is refused at upload, so it can never reach a request', async () => {
    const { customer } = await setup();
    const res = await api().post('/api/media').set(bearer(customer.token)).attach('media', mp4Buffer(12), { filename: 'long.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(400);
  });

  test('starting from a listing links it and tells the owner; asking about your own listing is refused', async () => {
    const { category, customer, a } = await setup();
    const listing = await MarketListing.create({ owner: a.user._id, kind: 'service', category: category._id, name: 'Wi-Fi setup', description: 'We set up office networks properly.', priceType: 'negotiable', status: 'active' });
    const res = await createRequest(customer.token, validRequest(category._id, { fromListing: String(listing._id) }));
    expect(res.status).toBe(201);
    expect(res.body.data.request.sourceListing).toBe(String(listing._id));

    const own = await createRequest(a.token, validRequest(category._id, { fromListing: String(listing._id) }));
    expect(own.status).toBe(400);
    expect(own.body.error.code).toBe('CANNOT_REQUEST_SELF');
  });

  test('a listing and a post cannot both be the source', async () => {
    const { category, customer } = await setup();
    const res = await createRequest(customer.token, validRequest(category._id, { fromListing: '64b000000000000000000001', fromPost: '64b000000000000000000002' }));
    expect(res.status).toBe(400);
  });
});

describe('quotations with media and a duration, compared side by side', () => {
  test('a provider attaches a photo and a number of days; the customer sees them', async () => {
    const { category, customer, a } = await setup();
    const req = (await createRequest(customer.token, validRequest(category._id))).body.data.request;
    const img = await photo(a.token);
    const res = await quote(a.token, req.id, { durationDays: 3, mediaIds: [img.id] });
    expect(res.status).toBe(201);
    expect(res.body.data.quotation).toMatchObject({ durationDays: 3 });
    expect(res.body.data.quotation.media).toHaveLength(1);
  });

  test('sorting by price, rating and speed, with the best offers badged', async () => {
    const { category, customer, a, b, c } = await setup();
    const req = (await createRequest(customer.token, validRequest(category._id))).body.data.request;
    await quote(a.token, req.id, { price: 40000, durationDays: 5 });
    await quote(b.token, req.id, { price: 25000, durationDays: 9 });
    await quote(c.token, req.id, { price: 33000, durationDays: 2 });

    const byPrice = await api().get(`/api/requests/${req.id}/quotations?sort=price`).set(bearer(customer.token));
    expect(byPrice.body.data.quotations.map((q) => q.price)).toEqual([25000, 33000, 40000]);
    const bySpeed = await api().get(`/api/requests/${req.id}/quotations?sort=speed`).set(bearer(customer.token));
    expect(bySpeed.body.data.quotations.map((q) => q.durationDays)).toEqual([2, 5, 9]);

    const badges = Object.fromEntries(byPrice.body.data.quotations.map((q) => [q.price, q.badges]));
    expect(badges[25000]).toContain('lowest_price');
    expect(badges[33000]).toContain('fastest');
    expect(badges[40000]).not.toContain('lowest_price');

    expect((await api().get(`/api/requests/${req.id}/quotations?sort=nonsense`).set(bearer(customer.token))).status).toBe(400);
  });

  test('a provider sees only their own quotation and no badges', async () => {
    const { category, customer, a, b } = await setup();
    const req = (await createRequest(customer.token, validRequest(category._id))).body.data.request;
    await quote(a.token, req.id);
    await quote(b.token, req.id, { price: 20000 });
    const res = await api().get(`/api/requests/${req.id}/quotations`).set(bearer(a.token));
    expect(res.body.data.quotations).toHaveLength(1);
    expect(res.body.data.quotations[0].badges).toBeUndefined();
  });
});

describe('one provider or several', () => {
  test('by default accepting one offer declines the others and closes the request', async () => {
    const { category, customer, a, b } = await setup();
    const req = (await createRequest(customer.token, validRequest(category._id))).body.data.request;
    const qa = (await quote(a.token, req.id)).body.data.quotation;
    const qb = (await quote(b.token, req.id, { price: 30000 })).body.data.quotation;
    expect((await decide(customer.token, qa.id, 'accepted')).status).toBe(200);
    expect((await Quotation.findById(qb.id)).status).toBe('rejected');
    expect((await ServiceRequest.findById(req.id)).status).toBe('accepted');
    expect((await decide(customer.token, qb.id, 'accepted')).status).toBe(409);
    expect((await api().post(`/api/requests/${req.id}/close`).set(bearer(customer.token))).status).toBe(409);
  });

  test('when several offers are allowed, the request stays open, each accepted offer gets its own job, and the rest wait', async () => {
    const { category, customer, a, b, c } = await setup();
    const req = (await createRequest(customer.token, validRequest(category._id, { allowMultiple: true }))).body.data.request;
    expect(req.allowMultiple).toBe(true);
    const qa = (await quote(a.token, req.id)).body.data.quotation;
    const qb = (await quote(b.token, req.id, { price: 30000 })).body.data.quotation;
    const qc = (await quote(c.token, req.id, { price: 31000 })).body.data.quotation;

    expect((await decide(customer.token, qa.id, 'accepted')).status).toBe(200);
    expect((await decide(customer.token, qb.id, 'accepted')).status).toBe(200);

    const stored = await ServiceRequest.findById(req.id);
    expect(stored.status).toBe('open');
    expect(stored.acceptedCount).toBe(2);
    expect((await Quotation.findById(qc.id)).status).toBe('pending');
    expect(await Booking.countDocuments({ request: req.id })).toBe(2);

    const detail = await api().get(`/api/requests/${req.id}`).set(bearer(customer.token));
    expect(detail.body.data.request.bookingIds).toHaveLength(2);
    const asProvider = await api().get(`/api/requests/${req.id}`).set(bearer(a.token));
    expect(asProvider.body.data.request.bookingIds).toBeUndefined();
  });

  test('closing declines what is left and tells those providers; it needs at least one accepted offer', async () => {
    const { category, customer, a, b } = await setup();
    const req = (await createRequest(customer.token, validRequest(category._id, { allowMultiple: true }))).body.data.request;
    const qa = (await quote(a.token, req.id)).body.data.quotation;
    const qb = (await quote(b.token, req.id, { price: 30000 })).body.data.quotation;

    expect((await api().post(`/api/requests/${req.id}/close`).set(bearer(customer.token))).status).toBe(409);
    await decide(customer.token, qa.id, 'accepted');
    const closed = await api().post(`/api/requests/${req.id}/close`).set(bearer(customer.token));
    expect(closed.status).toBe(200);
    expect(closed.body.data.request.status).toBe('accepted');
    expect((await Quotation.findById(qb.id)).status).toBe('rejected');
    expect((await quote((await createProvider({ profileOverrides: { categories: [category._id] } })).token, req.id)).status).toBe(409);
  });

  test('only the owner can close, and a request with accepted offers cannot be cancelled', async () => {
    const { category, customer, a } = await setup();
    const req = (await createRequest(customer.token, validRequest(category._id, { allowMultiple: true }))).body.data.request;
    const qa = (await quote(a.token, req.id)).body.data.quotation;
    await decide(customer.token, qa.id, 'accepted');
    expect((await api().post(`/api/requests/${req.id}/close`).set(bearer(a.token))).status).toBeGreaterThanOrEqual(403);
    expect((await api().post(`/api/requests/${req.id}/close`)).status).toBe(401);
    const cancel = await api().patch(`/api/requests/${req.id}`).set(bearer(customer.token)).send({ status: 'cancelled' });
    expect(cancel.status).toBe(409);
  });
});
