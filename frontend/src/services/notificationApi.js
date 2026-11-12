import { get, post, patch } from './api';

export const notificationApi = {
  list: (query, signal) => get('/notifications', { query, signal }),
  unreadCount: (signal) => get('/notifications/unread-count', { signal }),
  markRead: (id) => patch(`/notifications/${id}/read`),
  markAllRead: (category) => post('/notifications/read-all', category ? { category } : {}),
};
