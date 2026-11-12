const CompanyProfile = require('../models/CompanyProfile');
const { api, bearer, createAdmin, createCategory, createSession, createProvider } = require('./helpers');

const get = (id, token) => (token ? api().get(`/api/profiles/${id}`).set(bearer(token)) : api().get(`/api/profiles/${id}`));

describe('public profiles', () => {
  test('a verified provider shows public details and no private ones; anyone can open it without signing in', async () => {
    const category = await createCategory();
    const provider = await createProvider({ profileOverrides: { categories: [category._id], bio: 'Electrician in Huye', contactPreferences: { showPhone: true, showEmail: true } } });
    await provider.user.updateOne({ phone: '+250788333444' });
    const res = await get(provider.user._id);
    expect(res.status).toBe(200);
    const p = res.body.data.profile;
    expect(p).toMatchObject({ id: String(provider.user._id), type: 'provider', isMe: false, followers: 0, followedByMe: false, counts: { posts: 0, listings: 0 } });
    expect(p.provider).toMatchObject({ bio: 'Electrician in Huye' });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/250788333444/);
    expect(text).not.toContain(provider.user.email);
  });

  test('an unverified provider only shows the basics', async () => {
    const provider = await createProvider({ verified: false });
    const res = await get(provider.user._id);
    expect(res.status).toBe(200);
    expect(res.body.data.profile.provider).toBeUndefined();
  });

  test('a business shows its public company details but not its registration number or contact person', async () => {
    const owner = await createSession(['business']);
    await CompanyProfile.create({ owner: owner.user._id, companyName: 'Imana Ltd', registrationNumber: '123456789', industry: 'Construction', contactPerson: { name: 'Secret Person', phone: '+250788000111' } });
    const res = await get(owner.user._id);
    expect(res.body.data.profile).toMatchObject({ type: 'business', business: { companyName: 'Imana Ltd', industry: 'Construction' } });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('123456789');
    expect(text).not.toContain('Secret Person');
    expect(text).not.toContain('250788000111');
  });

  test('a signed-in viewer sees whether they follow, and whether it is their own page', async () => {
    const a = await createSession(['customer']);
    const b = await createSession(['customer']);
    await api().post(`/api/follows/${b.user._id}`).set(bearer(a.token));
    const seen = await get(b.user._id, a.token);
    expect(seen.body.data.profile).toMatchObject({ followers: 1, followedByMe: true, isMe: false });
    expect((await get(a.user._id, a.token)).body.data.profile.isMe).toBe(true);
  });

  test('a customer page needs a signed-in viewer; providers and businesses stay public', async () => {
    const customer = await createSession(['customer']);
    const viewer = await createSession(['customer']);
    expect((await get(customer.user._id)).status).toBe(404);
    expect((await get(customer.user._id, viewer.token)).status).toBe(200);
  });

  test('staff, suspended and missing accounts are not found; a bad id is rejected', async () => {
    const admin = await createAdmin();
    const gone = await createSession(['customer']);
    await gone.user.updateOne({ status: 'suspended' });
    expect((await get(admin.user._id)).status).toBe(404);
    expect((await get(gone.user._id)).status).toBe(404);
    expect((await get('64b000000000000000000000')).status).toBe(404);
    expect((await get('nope')).status).toBe(400);
  });
});
