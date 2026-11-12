const { api, bearer, createSession, fileExists, pngBuffer, mp4Buffer: mp4 } = require('./helpers');

// ---- tiny synthetic video files (just the headers that carry the length). The MP4 builder lives in helpers.js ------------------
const { detectVideo } = require('../utils/videoInfo');

const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

/** A WebM that is `seconds` long (Segment of unknown size > Info > TimecodeScale + Duration in milliseconds). */
function webm(seconds) {
  const duration = Buffer.alloc(8); duration.writeDoubleBE(seconds * 1000);
  const info = Buffer.concat([Buffer.from([0x2a, 0xd7, 0xb1, 0x83, 0x0f, 0x42, 0x40]), Buffer.from([0x44, 0x89, 0x88]), duration]);
  const infoEl = Buffer.concat([Buffer.from([0x15, 0x49, 0xa9, 0x66, 0x80 | info.length]), info]);
  const segment = Buffer.concat([Buffer.from([0x18, 0x53, 0x80, 0x67, 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), infoEl]);
  return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80]), segment]);
}

const send = (token, buffer, { name = 'clip.mp4', type = 'video/mp4' } = {}) =>
  api().post('/api/media').set(bearer(token)).attach('media', buffer, { filename: name, contentType: type });

describe('reading the length of a video from its own bytes', () => {
  test('MP4 (both header versions), QuickTime and WebM', () => {
    expect(detectVideo(mp4(7.5)).durationSeconds).toBeCloseTo(7.5, 2);
    expect(detectVideo(mp4(7.5, { version: 1 })).durationSeconds).toBeCloseTo(7.5, 2);
    expect(detectVideo(mp4(3, { brand: 'qt  ' }))).toMatchObject({ ext: 'mov', mime: 'video/quicktime' });
    expect(detectVideo(webm(9)).durationSeconds).toBeCloseTo(9, 2);
  });

  test('is not fooled: a damaged file or a non-video gives no length or no type', () => {
    expect(detectVideo(mp4(5).subarray(0, 40)).durationSeconds).toBeNull();
    expect(detectVideo(Buffer.from('just some text, definitely not a video file'))).toBeNull();
  });
});

describe('POST /api/media', () => {
  test('needs a signed-in user', async () => {
    const res = await api().post('/api/media').attach('media', mp4(5), { filename: 'a.mp4', contentType: 'video/mp4' });
    expect(res.status).toBe(401);
  });

  test('accepts a video of exactly 10 seconds and a shorter one, and stores it', async () => {
    const { token } = await createSession(['customer']);
    const ten = await send(token, mp4(10));
    expect(ten.status).toBe(201);
    expect(ten.body.data.media).toMatchObject({ kind: 'video', mime: 'video/mp4', durationSeconds: 10 });
    expect(ten.body.data.media.id).toMatch(/^[a-f0-9]{24}$/);
    expect(fileExists(ten.body.data.media.url)).toBe(true);
    expect((await send(token, webm(4), { name: 'a.webm', type: 'video/webm' })).status).toBe(201);
  });

  test('refuses a video longer than 10 seconds, and one whose length cannot be read', async () => {
    const { token } = await createSession(['customer']);
    const long = await send(token, mp4(10.5));
    expect(long.status).toBe(400);
    expect(long.body.error.code).toBe('VIDEO_TOO_LONG');
    expect((await send(token, mp4(60))).body.error.code).toBe('VIDEO_TOO_LONG');
    expect((await send(token, webm(30), { name: 'a.webm', type: 'video/webm' })).body.error.code).toBe('VIDEO_TOO_LONG');
    // an MP4 with no moov box: the length is unknown, so it is refused rather than trusted
    const noMoov = mp4(5).subarray(0, 28);
    expect((await send(token, noMoov)).body.error.code).toBe('VIDEO_DURATION_UNKNOWN');
  });

  test('judges the file by its bytes: a renamed text file is refused, a photo is accepted', async () => {
    const { token } = await createSession(['customer']);
    const fake = await send(token, Buffer.from('this is not a video, whatever the name says'.repeat(3)), { name: 'x.mp4' });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_FILE_TYPE');
    const photo = await api().post('/api/media').set(bearer(token)).attach('media', pngBuffer(2000), { filename: 'p.png', contentType: 'image/png' });
    expect(photo.status).toBe(201);
    expect(photo.body.data.media).toMatchObject({ kind: 'image', mime: 'image/png' });
    expect(photo.body.data.media.durationSeconds).toBeUndefined();
  });

  test('requires a file', async () => {
    const { token } = await createSession(['customer']);
    expect((await api().post('/api/media').set(bearer(token))).body.error.code).toBe('NO_FILE');
  });
});
