import { useCallback, useEffect, useState } from 'react';
import { useMessageStream } from './useMessageStream';
import { notificationApi } from '../services/notificationApi';

const CHANGED = 'sb:notifications-changed';
const POLL_MS = 60_000;

/** Call after reading notifications so the bell updates straight away. */
export const notifyChanged = () => window.dispatchEvent(new Event(CHANGED));

const NONE = { total: 0, quotation: 0, message: 0, general: 0 };

/**
 * Unread notifications, in total and apart: quotations, messages and everything else. Refreshed every minute while the tab is
 * visible, when a chat message arrives, and on demand.
 */
export function useUnreadCounts() {
  const [counts, setCounts] = useState(NONE);

  const refresh = useCallback(async () => {
    if (document.visibilityState === 'hidden') return;
    try {
      const { data } = await notificationApi.unreadCount();
      const by = data.byCategory || {};
      setCounts({ total: data.unreadCount ?? 0, quotation: by.quotation ?? 0, message: by.message ?? 0, general: by.general ?? 0 });
    } catch { /* the bell is a convenience; a failed poll just keeps the last number */ }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, POLL_MS);
    window.addEventListener(CHANGED, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(id);
      window.removeEventListener(CHANGED, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refresh]);

  useMessageStream(refresh);

  return counts;
}

/** Just the total, for anything that only needs one number. */
export const useUnreadCount = () => useUnreadCounts().total;
