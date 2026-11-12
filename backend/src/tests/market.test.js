const AuditLog = require('../models/AuditLog');
const MarketListing = require('../models/MarketListing');
const Notification = require('../models/Notification');
const { api, bearer, createAdmin, createSession, createCategory, pngBuffer, fileExists } = require('./helpers');

const shopCategory = (over = {}) =>
  createCategory({
    name: 'Fashion', slug: 'fashion', kind: 'product',
    requiredFields: [
      { key: 'size', label: 'Size', type: 'select', options: ['S', 'M', 'L'], required: true },
      { key: 'brand', label: 'Brand', type: 'text', required: false },
      { key: 'weight_kg', label: 'Weight', type: 'number', required: false },
    ],
    ...over,
  });

const body = (category, over = {}) => ({
  kind: 'product', name: 'Kitenge dress', description: 'Hand sewn kitenge dress, made in Kigali.',
  category: String(category._id), district: 'Gasabo', priceType: 'fixed', priceMin: 25000,
  details: { size: 'M', brand: 'Imbehe Studio' }, stock: { tracked: true, quantity: 4 },
  ...over,
});
const post = (token, b) => api().post('/api/market').set(bearer(token)).send(b);
const upload = (token) => api().post('/api/media').set(bearer(token)).attach('media', pngBuffer(500), { filename: 'p.png', contentType: 'image/png' });

describe('publishing a product or business listing', () => {
  test('a customer, provider or business can publish; the answer includes the category details and stock', async () => {
    const category = await shopCategory();
    for (const role of ['customer', 'provider', 'business']) {
      const { token } = await createSession([role]);
      const res = await post(token, body(category));
      expect(res.status).toBe(201);
      expect(res.body.data.listing).toMatchObject({ kind: 'product', status: 'active', priceType: 'fixed', priceMin: 25000, inStock: true, mine: true });
      expect(res.body.data.listing.detailList).toEqual([
        { key: 'size', label: 'Size', value: 'M' },
        { key: 'brand', label: 'Brand', value: 'Imbehe Studio' },
      ]);
    }
  });

  test('needs a signed-in person; staff cannot publish', async () => {
    const category = await shopCategory();
    expect((await api().post('/api/market').send(body(category))).status).toBe(401);
    const admin = await createAdmin();
    const res = await post(admin.token, body(category));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('STAFF_CANNOT_PUBLISH');
  });

  test('the category decides the details: required ones, unknown ones and wrong types are refused', async () => {
    const category = await shopCategory();
    const { token } = await createSession(['business']);
    const missing = await post(token, body(category, { details: { brand: 'x' } }));
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe('LISTING_DETAILS_INVALID');
    expect(missing.body.error.message).toMatch(/Size/);
    expect((await post(token, body(category, { details: { size: 'XXL' } }))).body.error.code).toBe('LISTING_DETAILS_INVALID');
    expect((await post(token, body(category, { details: { size: 'M', colour: 'red' } }))).body.error.code).toBe('LISTING_DETAILS_INVALID');
    expect((await post(token, body(category, { details: { size: 'M', weight_kg: 'heavy' } }))).body.error.code).toBe('LISTING_DETAILS_INVALID');
  });

  test('the category must be active and of the same type', async () => {
    const services = await createCategory({ name: 'Plumbing', slug: 'plumbing' });
    const hidden = await shopCategory({ name: 'Old', slug: 'old', status: 'disabled' });
    const { token } = await createSession(['business']);
    expect((await post(token, body(services, { details: {} }))).body.error.code).toBe('CATEGORY_KIND_MISMATCH');
    expect((await post(token, body(hidden))).body.error.code).toBe('CATEGORY_NOT_FOUND');
    const shop = await shopCategory({ name: 'Shops', slug: 'shops', kind: 'business', requiredFields: [] });
    expect((await post(token, body(shop, { kind: 'product', details: {} }))).body.error.code).toBe('CATEGORY_KIND_MISMATCH');
    expect((await post(token, body(shop, { kind: 'business', details: {}, priceType: 'negotiable', priceMin: undefined, stock: undefined }))).status).toBe(201);
  });

  test('prices: fixed needs a price, a range needs both ends in order, negotiable needs none', async () => {
    const category = await shopCategory();
    const { token } = await createSession(['business']);
    expect((await post(token, body(category, { priceMin: undefined }))).status).toBe(400);
    expect((await post(token, body(category, { priceType: 'range', priceMin: 100, priceMax: undefined }))).status).toBe(400);
    expect((await post(token, body(category, { priceType: 'range', priceMin: 500, priceMax: 100 }))).status).toBe(400);
    expect((await post(token, body(category, { priceMin: 12.5 }))).status).toBe(400);
    expect((await post(token, body(category, { priceType: 'range', priceMin: 100, priceMax: 500 }))).status).toBe(201);
    expect((await post(token, body(category, { priceType: 'negotiable', priceMin: undefined }))).status).toBe(201);
  });

  test('tracked stock needs a quantity', async () => {
    const category = await shopCategory();
    const { token } = await createSession(['business']);
    expect((await post(token, body(category, { stock: { tracked: true } }))).status).toBe(400);
    expect((await post(token, body(category, { stock: { tracked: false, note: 'Open Mon-Sat' } }))).status).toBe(201);
  });

  test('photos and videos are attached by id, only your own, and only once', async () => {
    const category = await shopCategory();
    const a = await createSession(['business']);
    const b = await createSession(['business']);
    const mine = (await upload(a.token)).body.data.media.id;
    const theirs = (await upload(b.token)).body.data.media.id;

    expect((await post(a.token, body(category, { mediaIds: [theirs] }))).body.error.code).toBe('INVALID_MEDIA');
    const ok = await post(a.token, body(category, { mediaIds: [mine] }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.listing.media).toHaveLength(1);
    expect(ok.body.data.listing.media[0]).toMatchObject({ kind: 'image' });
    expect((await post(a.token, body(category, { mediaIds: [mine] }))).body.error.code).toBe('INVALID_MEDIA');
  });

  test('contact methods and trade options are stored, and no phone or email is ever shown on a listing', async () => {
    const category = await shopCategory();
    const { token, user } = await createSession(['business']);
    const res = await post(token, body(category, { contactMethods: ['message', 'phone'], transactionOptions: ['quotation', 'pickup'] }));
    expect(res.body.data.listing).toMatchObject({ contactMethods: ['message', 'phone'], transactionOptions: ['quotation', 'pickup'] });
    const text = JSON.stringify((await api().get(`/api/market/${res.body.data.listing.id}`)).body);
    expect(text).not.toContain(user.email);
    expect(res.body.data.listing.owner.email).toBeUndefined();
    expect(res.body.data.listing.owner.phone).toBeUndefined();
  });
});

describe('browsing, searching and comparing', () => {
  const seed = async () => {
    const fashion = await shopCategory();
    const food = await shopCategory({ name: 'Food', slug: 'food', requiredFields: [] });
    const a = await createSession(['business']);
    const b = await createSession(['customer']);
    const mk = async (token, cat, over) => (await post(token, body(cat, { details: cat === fashion ? { size: 'M' } : {}, ...over }))).body.data.listing;
    return {
      a, b, fashion, food,
      dress: await mk(a.token, fashion, { name: 'Kitenge dress', priceMin: 25000 }),
      shirt: await mk(a.token, fashion, { name: 'Cotton shirt', priceMin: 8000, district: 'Huye', stock: { tracked: true, quantity: 0 } }),
      avocado: await mk(b.token, food, { name: 'Fresh avocados', description: 'Ripe avocados from Musanze farms.', priceType: 'range', priceMin: 500, priceMax: 1500, district: 'Musanze', stock: undefined }),
    };
  };

  test('is public and lists active listings, newest first', async () => {
    const { dress, shirt, avocado } = await seed();
    const res = await api().get('/api/market');
    expect(res.status).toBe(200);
    expect(res.body.data.map((l) => l.id)).toEqual([avocado.id, shirt.id, dress.id]);
    expect(res.body.meta.total).toBe(3);
  });

  test('filters by category, district, kind, owner and in-stock; searches by words', async () => {
    const { fashion, a, dress, shirt, avocado } = await seed();
    const ids = async (qs) => (await api().get(`/api/market?${qs}`)).body.data.map((l) => l.id).sort();
    expect(await ids(`category=${fashion._id}`)).toEqual([dress.id, shirt.id].sort());
    expect(await ids('district=Huye')).toEqual([shirt.id]);
    expect(await ids(`owner=${a.user._id}`)).toEqual([dress.id, shirt.id].sort());
    expect(await ids('inStock=true')).toEqual([dress.id, avocado.id].sort()); // the shirt has none left
    expect(await ids('q=avocados')).toEqual([avocado.id]);
    expect(await ids('q=KITENGE')).toEqual([dress.id]);
  });

  test('price filter matches a price or a range that overlaps; sort by price', async () => {
    const { dress, shirt, avocado } = await seed();
    const ids = async (qs) => (await api().get(`/api/market?${qs}`)).body.data.map((l) => l.id);
    expect((await ids('minPrice=10000&maxPrice=30000'))).toEqual([dress.id]);
    expect((await ids('maxPrice=1000')).sort()).toEqual([avocado.id]); // its range starts at 500
    expect((await ids('minPrice=1200&maxPrice=9000')).sort()).toEqual([avocado.id, shirt.id].sort());
    expect(await ids('sort=price_asc')).toEqual([avocado.id, shirt.id, dress.id]);
    expect(await ids('sort=price_desc')).toEqual([dress.id, shirt.id, avocado.id]);
  });

  test('compares two to four listings side by side', async () => {
    const { dress, shirt } = await seed();
    const res = await api().get(`/api/market/compare?ids=${dress.id},${shirt.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((l) => l.id)).toEqual([dress.id, shirt.id]);
    expect((await api().get(`/api/market/compare?ids=${dress.id}`)).status).toBe(400);
    expect((await api().get('/api/market/compare?ids=a,b,c,d,e')).status).toBe(400);
  });

  test('shows whether the seller is verified', async () => {
    const { a, dress } = await seed();
    expect((await api().get(`/api/market/${dress.id}`)).body.data.listing.owner.verified).toBe(false);
    const User = require('../models/User');
    await User.updateOne({ _id: a.user._id }, { accountVerified: true });
    expect((await api().get(`/api/market/${dress.id}`)).body.data.listing.owner.verified).toBe(true);
  });
});

describe('owning a listing: status, editing, deleting', () => {
  const setup = async () => {
    const category = await shopCategory();
    const owner = await createSession(['business']);
    const listing = (await post(owner.token, body(category))).body.data.listing;
    return { category, owner, listing };
  };

  test('the owner moves it between active, inactive, sold and completed; inactive is hidden, sold stays visible', async () => {
    const { owner, listing } = await setup();
    const set = (status) => api().patch(`/api/market/${listing.id}/status`).set(bearer(owner.token)).send({ status });
    expect((await set('inactive')).body.data.listing.status).toBe('inactive');
    expect((await api().get(`/api/market/${listing.id}`)).status).toBe(404); // hidden from the public
    expect((await api().get(`/api/market/${listing.id}`).set(bearer(owner.token))).status).toBe(200); // but not from the owner
    expect((await api().get('/api/market')).body.data).toHaveLength(0);

    expect((await set('sold')).body.data.listing.status).toBe('sold');
    expect((await api().get(`/api/market/${listing.id}`)).status).toBe(200);
    expect((await api().get('/api/market')).body.data).toHaveLength(0); // not for sale any more
    expect((await api().get('/api/market?status=sold')).body.data).toHaveLength(1);
    expect((await set('completed')).body.data.listing.status).toBe('completed');
    expect((await set('nonsense')).status).toBe(400);
  });

  test('only the owner can change or delete it; to anyone else it does not exist', async () => {
    const { listing } = await setup();
    const other = await createSession(['business']);
    expect((await api().put(`/api/market/${listing.id}`).set(bearer(other.token)).send({ name: 'Stolen name' })).status).toBe(404);
    expect((await api().patch(`/api/market/${listing.id}/status`).set(bearer(other.token)).send({ status: 'sold' })).status).toBe(404);
    expect((await api().delete(`/api/market/${listing.id}`).set(bearer(other.token))).status).toBe(404);
    expect((await api().put(`/api/market/${listing.id}`).send({ name: 'x y z' })).status).toBe(401);
  });

  test('edits the text, price and details again against the category; the type cannot change', async () => {
    const { owner, listing } = await setup();
    const put = (b) => api().put(`/api/market/${listing.id}`).set(bearer(owner.token)).send(b);
    const res = await put({ name: 'Kitenge dress, new', priceType: 'range', priceMin: 20000, priceMax: 30000, details: { size: 'L' }, stock: { tracked: true, quantity: 0 } });
    expect(res.status).toBe(200);
    expect(res.body.data.listing).toMatchObject({ name: 'Kitenge dress, new', priceType: 'range', priceMax: 30000, inStock: false });
    expect(res.body.data.listing.detailList[0]).toMatchObject({ key: 'size', value: 'L' });
    expect((await put({ kind: 'business' })).status).toBe(400);
    expect((await put({ details: { size: 'HUGE' } })).body.error.code).toBe('LISTING_DETAILS_INVALID');
    expect((await put({ priceMin: 90000 })).status).toBe(400); // above the highest price (30000)
    expect((await put({})).status).toBe(400);
  });

  test('deleting removes the listing and its uploaded files', async () => {
    const category = await shopCategory();
    const owner = await createSession(['business']);
    const media = (await upload(owner.token)).body.data.media;
    const listing = (await post(owner.token, body(category, { mediaIds: [media.id] }))).body.data.listing;
    expect(fileExists(media.url)).toBe(true);
    expect((await api().delete(`/api/market/${listing.id}`).set(bearer(owner.token))).status).toBe(200);
    expect(await MarketListing.countDocuments()).toBe(0);
    expect(fileExists(media.url)).toBe(false);
  });

  test('"mine" lists your own listings in every status', async () => {
    const { owner, listing } = await setup();
    await api().patch(`/api/market/${listing.id}/status`).set(bearer(owner.token)).send({ status: 'inactive' });
    const other = await createSession(['customer']);
    const res = await api().get('/api/market/mine').set(bearer(owner.token));
    expect(res.body.data.map((l) => l.id)).toEqual([listing.id]);
    expect((await api().get('/api/market/mine').set(bearer(other.token))).body.data).toHaveLength(0);
    expect((await api().get('/api/market/mine')).status).toBe(401);
  });
});

describe('moderation by administrators', () => {
  test('an administrator hides a listing with a reason; the owner is told and cannot re-activate it; restoring brings it back', async () => {
    const category = await shopCategory();
    const owner = await createSession(['business']);
    const listing = (await post(owner.token, body(category))).body.data.listing;
    const admin = await createAdmin();

    expect((await api().post(`/api/market/${listing.id}/takedown`).set(bearer(admin.token)).send({})).status).toBe(400); // a reason is required
    const res = await api().post(`/api/market/${listing.id}/takedown`).set(bearer(admin.token)).send({ reason: 'Misleading photos' });
    expect(res.status).toBe(200);
    expect(res.body.data.listing.takenDown.reason).toBe('Misleading photos');

    expect((await api().get(`/api/market/${listing.id}`)).status).toBe(404);
    expect((await api().get('/api/market')).body.data).toHaveLength(0);
    const seenByOwner = await api().get(`/api/market/${listing.id}`).set(bearer(owner.token));
    expect(seenByOwner.body.data.listing.takenDown.reason).toBe('Misleading photos');
    const blocked = await api().patch(`/api/market/${listing.id}/status`).set(bearer(owner.token)).send({ status: 'active' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('LISTING_TAKEN_DOWN');
    expect(await Notification.countDocuments({ user: owner.user._id, type: 'listing.moderated' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'listing.takedown', actor: admin.user._id })).toBe(1);

    expect((await api().post(`/api/market/${listing.id}/restore`).set(bearer(admin.token))).status).toBe(200);
    expect((await api().get(`/api/market/${listing.id}`)).status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'listing.restore' })).toBe(1);
  });

  test('only administrators can hide or restore', async () => {
    const category = await shopCategory();
    const owner = await createSession(['business']);
    const listing = (await post(owner.token, body(category))).body.data.listing;
    for (const roles of [['customer'], ['business'], ['provider']]) {
      const { token } = await createSession(roles);
      expect((await api().post(`/api/market/${listing.id}/takedown`).set(bearer(token)).send({ reason: 'No reason' })).status).toBe(403);
    }
    expect((await api().post(`/api/market/${listing.id}/takedown`).send({ reason: 'No reason' })).status).toBe(401);
  });

  test('a hidden listing is not offered for comparison', async () => {
    const category = await shopCategory();
    const owner = await createSession(['business']);
    const one = (await post(owner.token, body(category))).body.data.listing;
    const two = (await post(owner.token, body(category))).body.data.listing;
    const admin = await createAdmin();
    await api().post(`/api/market/${one.id}/takedown`).set(bearer(admin.token)).send({ reason: 'Fraud report' });
    expect((await api().get(`/api/market/compare?ids=${one.id},${two.id}`)).status).toBe(404);
  });
});

describe('filtering by the category\'s own details', () => {
  const browse = (query) => api().get(`/api/market?${query}`);

  async function stocked() {
    const category = await shopCategory();
    const { token } = await createSession(['business']);
    await post(token, body(category, { name: 'Small dress', details: { size: 'S', brand: 'Imbehe Studio', weight_kg: 1 } }));
    await post(token, body(category, { name: 'Medium dress', details: { size: 'M', brand: 'Urban Kigali', weight_kg: 3 } }));
    await post(token, body(category, { name: 'Large coat', details: { size: 'L', brand: 'Urban Kigali', weight_kg: 6 } }));
    return category;
  }

  test('a select field matches exactly, a text field matches part of the answer, and filters combine', async () => {
    const category = await stocked();
    const bySize = await browse(`category=${category._id}&d[size]=M`);
    expect(bySize.body.data.map((l) => l.name)).toEqual(['Medium dress']);
    const byBrand = await browse(`category=${category._id}&d[brand]=kigali`);
    expect(byBrand.body.data.map((l) => l.name).sort()).toEqual(['Large coat', 'Medium dress']);
    const both = await browse(`category=${category._id}&d[brand]=kigali&d[size]=L`);
    expect(both.body.data.map((l) => l.name)).toEqual(['Large coat']);
  });

  test('a number field takes a minimum and a maximum', async () => {
    const category = await stocked();
    const res = await browse(`category=${category._id}&d[weight_kg_min]=2&d[weight_kg_max]=4`);
    expect(res.body.data.map((l) => l.name)).toEqual(['Medium dress']);
  });

  test('unknown names, options that do not exist and a missing category are refused', async () => {
    const category = await stocked();
    const unknown = await browse(`category=${category._id}&d[colour]=red`);
    expect(unknown.status).toBe(400);
    expect(unknown.body.error.code).toBe('INVALID_FILTER');
    expect((await browse(`category=${category._id}&d[size]=XXL`)).status).toBe(400);
    expect((await browse(`category=${category._id}&d[weight_kg_min]=heavy`)).status).toBe(400);
    expect((await browse('d[size]=M')).status).toBe(400);
  });
});

describe('saved listings', () => {
  const save = (token, id) => api().post(`/api/market/${id}/save`).set(bearer(token));
  const unsave = (token, id) => api().delete(`/api/market/${id}/save`).set(bearer(token));
  const saved = (token) => api().get('/api/market/saved').set(bearer(token));

  test('save, list, mark as saved in browsing, and remove', async () => {
    const category = await shopCategory();
    const seller = await createSession(['business']);
    const buyer = await createSession(['customer']);
    const id = (await post(seller.token, body(category))).body.data.listing.id;

    expect((await save(buyer.token, id)).status).toBe(200);
    expect((await save(buyer.token, id)).status).toBe(200); // saving twice is harmless
    const list = await saved(buyer.token);
    expect(list.body.data.map((l) => l.id)).toEqual([id]);
    expect(list.body.data[0].saved).toBe(true);

    const browsed = await api().get('/api/market').set(bearer(buyer.token));
    expect(browsed.body.data.find((l) => l.id === id).saved).toBe(true);
    expect((await api().get('/api/market')).body.data.find((l) => l.id === id).saved).toBe(false);

    expect((await unsave(buyer.token, id)).status).toBe(200);
    expect((await saved(buyer.token)).body.data).toHaveLength(0);
  });

  test('your saved list is yours, needs sign-in, and drops listings that were hidden', async () => {
    const category = await shopCategory();
    const seller = await createSession(['business']);
    const buyer = await createSession(['customer']);
    const other = await createSession(['customer']);
    const admin = await createAdmin();
    const id = (await post(seller.token, body(category))).body.data.listing.id;
    await save(buyer.token, id);

    expect((await api().get('/api/market/saved')).status).toBe(401);
    expect((await saved(other.token)).body.data).toHaveLength(0);

    await api().post(`/api/market/${id}/takedown`).set(bearer(admin.token)).send({ reason: 'Not allowed here' });
    expect((await saved(buyer.token)).body.data).toHaveLength(0);
    expect((await save(other.token, id)).status).toBe(404);
  });
});
