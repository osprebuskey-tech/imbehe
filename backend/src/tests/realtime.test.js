const realtime = require('../utils/realtime');
const { api, bearer, createSession } = require('./helpers');

const fakeRes = () => {
  const res = { written: [], ended: false, write(chunk) { this.written.push(chunk); return true; }, end() { this.ended = true; } };
  return res;
};

describe('live updates', () => {
  test('an event reaches every open connection of that person and nobody else', () => {
    const a1 = fakeRes(); const a2 = fakeRes(); const b = fakeRes();
    const offA1 = realtime.subscribe('user-a', a1);
    realtime.subscribe('user-a', a2);
    realtime.subscribe('user-b', b);
    expect(realtime.publish('user-a', 'message', { conversationId: 'c1' })).toBe(2);
    expect(a1.written.join('')).toContain('event: message');
    expect(a1.written.join('')).toContain('"conversationId":"c1"');
    expect(b.written).toHaveLength(0);
    offA1();
    expect(realtime.publish('user-a', 'message', {})).toBe(1);
    expect(realtime.publish('nobody', 'message', {})).toBe(0);
  });

  test('a person with too many tabs keeps only the newest connections', () => {
    const list = Array.from({ length: realtime.MAX_PER_USER + 2 }, () => fakeRes());
    list.forEach((res) => realtime.subscribe('many-tabs', res));
    expect(realtime.connectionCount('many-tabs')).toBe(realtime.MAX_PER_USER);
    expect(list[0].ended).toBe(true);
    expect(list.at(-1).ended).toBe(false);
  });

  test('a connection that fails while writing does not break publishing', () => {
    const broken = { write() { throw new Error('socket closed'); }, end() {} };
    realtime.subscribe('flaky', broken);
    expect(() => realtime.publish('flaky', 'message', {})).not.toThrow();
  });

  test('the stream needs sign-in', async () => {
    expect((await api().get('/api/messages/stream')).status).toBe(401);
    const a = await createSession(['customer']);
    expect(a.token).toBeTruthy();
    expect(bearer(a.token)).toBeTruthy();
  });
});
