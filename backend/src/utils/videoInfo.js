/**
 * Reads what a video file really is and how long it runs, from its own bytes (never the client's mimetype or filename).
 * Supports MP4 / QuickTime (the box layout: ftyp, then moov > mvhd) and WebM (EBML: Segment > Info > Duration).
 * Fails closed: if the length cannot be read, durationSeconds is null and the upload is refused.
 */

const readU32 = (b, o) => b.readUInt32BE(o);
const readU64 = (b, o) => Number(b.readBigUInt64BE(o));

/** Walks ISO base media boxes in [start, end) and returns the first box of the given type: { start, end, dataStart }. */
function findBox(buf, type, start = 0, end = buf.length) {
  let pos = start;
  while (pos + 8 <= end) {
    let size = readU32(buf, pos);
    const name = buf.toString('latin1', pos + 4, pos + 8);
    let header = 8;
    if (size === 1) {
      if (pos + 16 > end) return null;
      size = readU64(buf, pos + 8);
      header = 16;
    } else if (size === 0) {
      size = end - pos;
    }
    if (size < header || pos + size > end) return null; // damaged or truncated
    if (name === type) return { start: pos, end: pos + size, dataStart: pos + header };
    pos += size;
  }
  return null;
}

function mp4Duration(buf) {
  const moov = findBox(buf, 'moov');
  if (!moov) return null;
  const mvhd = findBox(buf, 'mvhd', moov.dataStart, moov.end);
  if (!mvhd) return null;
  const d = mvhd.dataStart;
  const version = buf[d];
  let timescale;
  let duration;
  if (version === 1) {
    if (d + 32 > mvhd.end) return null;
    timescale = readU32(buf, d + 20);
    duration = readU64(buf, d + 24);
  } else {
    if (d + 20 > mvhd.end) return null;
    timescale = readU32(buf, d + 12);
    duration = readU32(buf, d + 16);
  }
  if (!timescale || !Number.isFinite(duration)) return null;
  return duration / timescale;
}

// ---- WebM -----------------------------------------------------------------------------------------------------------------
function readVint(buf, pos, keepMarker) {
  if (pos >= buf.length) return null;
  const first = buf[pos];
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len += 1;
  if (len > 8 || pos + len > buf.length) return null;
  let value = keepMarker ? first : first & (0xff >> len);
  let unknown = !keepMarker && (first & (0xff >> len)) === (0xff >> len);
  for (let i = 1; i < len; i += 1) {
    value = value * 256 + buf[pos + i];
    if (buf[pos + i] !== 0xff) unknown = false;
  }
  return { value, len, unknown };
}

const ID = { SEGMENT: 0x18538067, INFO: 0x1549a966, TIMESCALE: 0x2ad7b1, DURATION: 0x4489 };

function webmDuration(buf) {
  // Walk elements: descend into Segment and Info, read TimecodeScale and Duration.
  let timescale = 1000000;
  let duration = null;
  const walk = (start, end, depth) => {
    let pos = start;
    while (pos < end && depth < 4) {
      const id = readVint(buf, pos, true);
      if (!id) return;
      const size = readVint(buf, pos + id.len, false);
      if (!size) return;
      const dataStart = pos + id.len + size.len;
      const dataEnd = size.unknown ? end : Math.min(end, dataStart + size.value);
      if (id.value === ID.SEGMENT || id.value === ID.INFO) walk(dataStart, dataEnd, depth + 1);
      else if (id.value === ID.TIMESCALE) timescale = buf.readUIntBE(dataStart, Math.min(6, dataEnd - dataStart));
      else if (id.value === ID.DURATION) {
        const n = dataEnd - dataStart;
        if (n === 4) duration = buf.readFloatBE(dataStart);
        else if (n === 8) duration = buf.readDoubleBE(dataStart);
      }
      if (duration !== null && depth > 0 && id.value === ID.DURATION) return;
      pos = dataEnd;
    }
  };
  walk(0, buf.length, 0);
  if (duration === null || !Number.isFinite(duration)) return null;
  return (duration * timescale) / 1e9;
}

/** -> { kind: 'video', ext, mime, durationSeconds } (durationSeconds null when it cannot be read), or null when not a supported video. */
function detectVideo(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  if (buf.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buf.toString('latin1', 8, 12);
    const quicktime = brand === 'qt  ';
    let durationSeconds = null;
    try { durationSeconds = mp4Duration(buf); } catch { durationSeconds = null; }
    return { kind: 'video', ext: quicktime ? 'mov' : 'mp4', mime: quicktime ? 'video/quicktime' : 'video/mp4', durationSeconds };
  }
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    let durationSeconds = null;
    try { durationSeconds = webmDuration(buf); } catch { durationSeconds = null; }
    return { kind: 'video', ext: 'webm', mime: 'video/webm', durationSeconds };
  }
  return null;
}

module.exports = { detectVideo, mp4Duration, webmDuration };
