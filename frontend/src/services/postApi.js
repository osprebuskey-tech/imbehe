import { get, post, put, del } from './api';

export const postApi = {
  feed: (query, signal) => get('/posts/feed', { query, signal }),
  discover: (query, signal) => get('/posts', { query, signal, auth: false }),
  saved: (query, signal) => get('/posts/saved', { query, signal }),
  get: (id, signal) => get(`/posts/${id}`, { signal }),
  create: (body) => post('/posts', body),
  update: (id, body) => put(`/posts/${id}`, body),
  remove: (id) => del(`/posts/${id}`),
  like: (id) => post(`/posts/${id}/like`),
  unlike: (id) => del(`/posts/${id}/like`),
  save: (id) => post(`/posts/${id}/save`),
  unsave: (id) => del(`/posts/${id}/save`),
  share: (id) => post(`/posts/${id}/share`),
  comments: (id, query, signal) => get(`/posts/${id}/comments`, { query, signal }),
  addComment: (id, body) => post(`/posts/${id}/comments`, { body }),
  removeComment: (id, commentId) => del(`/posts/${id}/comments/${commentId}`),
  follow: (userId) => post(`/follows/${userId}`),
  unfollow: (userId) => del(`/follows/${userId}`),
  followStats: (userId, signal) => get(`/follows/${userId}/stats`, { signal }),
  // One photo or one video of at most 10 seconds. Resolves { data: { media: { id, url, kind, ... } } }.
  uploadMedia: (file) => {
    const form = new FormData();
    form.append('media', file);
    return post('/media', form);
  },
};
