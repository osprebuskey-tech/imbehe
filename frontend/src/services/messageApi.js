import { get, post, del } from './api';

export const messageApi = {
  list: (query, signal) => get('/messages/conversations', { query, signal }),
  thread: (id, query, signal) => get(`/messages/conversations/${id}`, { query, signal }),
  start: (body) => post('/messages/conversations', body),
  send: (id, body) => post(`/messages/conversations/${id}/messages`, { body }),
  block: (userId) => post(`/messages/blocks/${userId}`),
  unblock: (userId) => del(`/messages/blocks/${userId}`),
};
