/*
 * Live updates over server-sent events. Each signed-in browser keeps one open request to GET /api/messages/stream, and the
 * server writes a small event to it when something arrives. Connections live in this process's memory, so with more than one
 * server instance a message sent on instance A would not reach a browser connected to instance B: put a shared channel (such as
 * Redis pub/sub) behind publish() before scaling out. The app also polls slowly, so nothing is lost either way.
 */
const MAX_PER_USER = 5;
const HEARTBEAT_MS = 25000;

const clients = new Map(); // userId -> Set of response objects

function subscribe(userId, res) {
  const key = String(userId);
  const set = clients.get(key) ?? new Set();
  clients.set(key, set);
  // A person with many tabs open: keep the newest few, close the oldest.
  while (set.size >= MAX_PER_USER) {
    const oldest = set.values().next().value;
    set.delete(oldest);
    try { oldest.end(); } catch { /* already closed */ }
  }
  set.add(res);
  return () => {
    set.delete(res);
    if (!set.size) clients.delete(key);
  };
}

/** Sends an event to every open connection of a person. Never throws: a dead connection must not break the request that triggered it. */
function publish(userId, event, data) {
  const set = clients.get(String(userId));
  if (!set) return 0;
  let sent = 0;
  for (const res of set) {
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      sent += 1;
    } catch { /* the close handler removes it */ }
  }
  return sent;
}

/** Turns a response into an event stream for one person, and cleans up when they leave. */
function open(req, res, userId) {
  res.status(200).set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders?.();
  res.write('retry: 5000\n\n');
  const unsubscribe = subscribe(userId, res);
  const beat = setInterval(() => { try { res.write(': keep-alive\n\n'); } catch { /* closed */ } }, HEARTBEAT_MS);
  beat.unref?.();
  const done = () => { clearInterval(beat); unsubscribe(); };
  req.on('close', done);
  res.on('error', done);
}

const connectionCount = (userId) => clients.get(String(userId))?.size ?? 0;

module.exports = { subscribe, publish, open, connectionCount, MAX_PER_USER };
