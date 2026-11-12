import { useEffect, useRef } from 'react';
import { API_BASE } from '../services/api';
import { getToken } from '../services/session';

/*
 * One server-sent event connection per browser tab, shared by everything that wants to know a message arrived (the bell, the
 * inbox, an open chat). It reads the stream with fetch so the sign-in token travels in a header (EventSource cannot send one).
 * When the connection drops it retries with a growing pause. The pages also poll slowly, so a missed event only delays an update.
 */
const listeners = new Set();
let controller = null;

async function connect(signal) {
  let delay = 1000;
  while (!signal.aborted) {
    try {
      const token = getToken();
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/messages/stream`, { headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      delay = 1000;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop();
        if (parts.some((p) => p.includes('event: message'))) listeners.forEach((fn) => fn());
      }
    } catch (err) {
      if (signal.aborted) return;
    }
    await new Promise((resolve) => {
      const t = setTimeout(resolve, delay);
      signal.addEventListener('abort', () => { clearTimeout(t); resolve(); }, { once: true });
    });
    delay = Math.min(delay * 2, 30000);
  }
}

function add(fn) {
  listeners.add(fn);
  if (!controller) { controller = new AbortController(); connect(controller.signal); }
  return () => {
    listeners.delete(fn);
    if (!listeners.size && controller) { controller.abort(); controller = null; }
  };
}

/** Calls onEvent() whenever a message arrives for this person. */
export function useMessageStream(onEvent, enabled = true) {
  const handler = useRef(onEvent);
  handler.current = onEvent;
  useEffect(() => (enabled ? add(() => handler.current()) : undefined), [enabled]);
}
