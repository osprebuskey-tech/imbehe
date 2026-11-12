const Notification = require('../models/Notification');
const MarketListing = require('../models/MarketListing');
const { hasContactDetails } = require('../services/messageService');
const {
  api, bearer, createCategory, createSession, createAdmin, createProvider, createBookingDoc, createRequestDoc,
} = require('./helpers');

const start = (token, body) => api().post('/api/messages/conversations').set(bearer(token)).send(body);
const reply = (token, id, body) => api().post(`/api/messages/conversations/${id}/messages`).set(bearer(token)).send({ body });
const open = (token, id, query = '') => api().get(`/api/messages/conversations/${id}${query}`).set(bearer(token));
const unread = async (token) => (await api().get('/api/messages/unread').set(bearer(token))).body.data.unread;

describe('spotting contact details', () => {
  test('phone numbers, emails and chat apps are caught; prices and dates are not', () => {
    expect(hasContactDetails('call me on 0788 123 456')).toBe(true);
    expect(hasContactDetails('+250 788-123-456')).toBe(true);
    expect(hasContactDetails('write to aline@example.com')).toBe(true);
    expect(hasContactDetails('find me on WhatsApp')).toBe(true);
    expect(hasContactDetails('the price is 35000 RWF, ready on 2026-11-08')).toBe(false);
  });
});

describe('conversations', () => {
  test('starting a chat sends the first message, notifies once, and shows up in both inboxes with unread counts', async () => {
    const a = await createSession(['customer']);
    const b = await createSession(['provider']);
    const res = await start(a.token, { userId: String(b.user._id), body: 'Hello, are you free this week?' });
    expect(res.status).toBe(201);
    expect(res.body.data.message).toMatchObject({ body: 'Hello, are you free this week?', mine: true });
    const id = res.body.data.conversation.id;

    await reply(a.token, id, 'Also, how much for a visit?');
    expect(await Notification.countDocuments({ type: 'message.new', user: b.user._id })).toBe(1);
    expect(await unread(b.token)).toBe(2);
    expect(await unread(a.token)).toBe(0);

    const inbox = await api().get('/api/messages/conversations').set(bearer(b.token));
    expect(inbox.body.data.conversations).toHaveLength(1);
    expect(inbox.body.data.conversations[0]).toMatchObject({ unread: 2, lastMessage: { body: 'Also, how much for a visit?', mine: false } });
    expect(inbox.body.data.conversations[0].other.id).toBe(String(a.user._id));

    const thread = await open(b.token, id);
    expect(thread.body.data.messages.map((m) => m.body)).toEqual(['Also, how much for a visit?', 'Hello, are you free this week?']);
    expect(await unread(b.token)).toBe(0);
    expect((await Notification.findOne({ type: 'message.new', user: b.user._id })).readAt).toBeTruthy();
  });

  test('there is one conversation per pair, whoever starts it', async () => {
    const a = await createSession(['customer']);
    const b = await createSession(['provider']);
    const one = await start(a.token, { userId: String(b.user._id), body: 'Hi' });
    const two = await start(b.token, { userId: String(a.user._id), body: 'Hi back' });
    expect(two.body.data.conversation.id).toBe(one.body.data.conversation.id);
  });

  test('paging back through a long thread', async () => {
    const a = await createSession(['customer']);
    const b = await createSession(['provider']);
    const first = await start(a.token, { userId: String(b.user._id), body: 'm1' });
    const id = first.body.data.conversation.id;
    for (let i = 2; i <= 5; i += 1) await reply(a.token, id, `m${i}`);
    const page1 = await open(a.token, id, '?limit=2');
    expect(page1.body.data.messages.map((m) => m.body)).toEqual(['m5', 'm4']);
    expect(page1.body.data.hasMore).toBe(true);
    const page2 = await open(a.token, id, `?limit=2&before=${page1.body.data.messages[1].id}`);
    expect(page2.body.data.messages.map((m) => m.body)).toEqual(['m3', 'm2']);
  });

  test('only the two people can read or write; everyone else gets 404; sign-in is needed', async () => {
    const a = await createSession(['customer']);
    const b = await createSession(['provider']);
    const outsider = await createSession(['customer']);
    const id = (await start(a.token, { userId: String(b.user._id), body: 'Private' })).body.data.conversation.id;
    expect((await open(outsider.token, id)).status).toBe(404);
    expect((await reply(outsider.token, id, 'hey')).status).toBe(404);
    expect((await api().get(`/api/messages/conversations/${id}`)).status).toBe(401);
    expect((await api().get('/api/messages/conversations').set(bearer(outsider.token))).body.data.conversations).toHaveLength(0);
  });

  test('you cannot message yourself, staff, or a missing account; empty and oversize messages are refused', async () => {
    const a = await createSession(['customer']);
    const admin = await createAdmin();
    expect((await start(a.token, { userId: String(a.user._id), body: 'me' })).status).toBe(400);
    expect((await start(a.token, { userId: String(admin.user._id), body: 'hi' })).status).toBe(404);
    expect((await start(a.token, { userId: '64b000000000000000000000', body: 'hi' })).status).toBe(404);
    const b = await createSession(['provider']);
    expect((await start(a.token, { userId: String(b.user._id), body: '   ' })).status).toBe(400);
    expect((await start(a.token, { userId: String(b.user._id), body: 'x'.repeat(2001) })).status).toBe(400);
  });
});

describe('contact privacy and blocking', () => {
  test('phone numbers and emails are refused until a job exists between the two people', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    const refused = await start(customer.token, { userId: String(provider.user._id), body: 'Call me on 0788123456' });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('CONTACT_DETAILS_NOT_ALLOWED');

    await createBookingDoc({ customer, provider, category });
    const allowed = await start(customer.token, { userId: String(provider.user._id), body: 'Call me on 0788123456' });
    expect(allowed.status).toBe(201);
  });

  test('a blocked person cannot message, and neither can the blocker until they unblock', async () => {
    const a = await createSession(['customer']);
    const b = await createSession(['provider']);
    const id = (await start(a.token, { userId: String(b.user._id), body: 'Hello' })).body.data.conversation.id;
    expect((await api().post(`/api/messages/blocks/${a.user._id}`).set(bearer(b.token))).status).toBe(200);
    const blocked = await reply(a.token, id, 'Are you there?');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('MESSAGING_BLOCKED');
    expect((await reply(b.token, id, 'No')).status).toBe(403);
    const inbox = await api().get('/api/messages/conversations').set(bearer(b.token));
    expect(inbox.body.data.conversations[0].blockedByMe).toBe(true);

    await api().delete(`/api/messages/blocks/${a.user._id}`).set(bearer(b.token));
    expect((await reply(a.token, id, 'Are you there?')).status).toBe(201);
  });

  test('you cannot block yourself', async () => {
    const a = await createSession(['customer']);
    expect((await api().post(`/api/messages/blocks/${a.user._id}`).set(bearer(a.token))).status).toBe(400);
  });
});

describe('conversations about something', () => {
  test('a listing, a request you are part of, or a post can be attached; one you cannot see cannot', async () => {
    const category = await createCategory();
    const customer = await createSession(['customer']);
    const provider = await createProvider({ profileOverrides: { categories: [category._id] } });
    const listing = await MarketListing.create({ owner: provider.user._id, kind: 'service', category: category._id, name: 'Wi-Fi setup', description: 'We set up office networks properly.', priceType: 'negotiable', status: 'active' });
    const ok = await start(customer.token, { userId: String(provider.user._id), body: 'Is this still on offer?', context: { type: 'listing', id: String(listing._id) } });
    expect(ok.status).toBe(201);
    expect(ok.body.data.conversation.context).toMatchObject({ type: 'listing', title: 'Wi-Fi setup' });

    const request = await createRequestDoc(customer.user, category);
    const stranger = await createSession(['customer']);
    const viaRequest = await start(customer.token, { userId: String(provider.user._id), body: 'About my request', context: { type: 'request', id: String(request._id) } });
    expect(viaRequest.body.data.conversation.context.type).toBe('request');
    const refused = await start(stranger.token, { userId: String(provider.user._id), body: 'Hi', context: { type: 'request', id: String(request._id) } });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('INVALID_CONTEXT');
  });
});
