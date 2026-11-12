import { get, post, put, patch, del } from './api';

export const marketApi = {
  browse: (query, signal) => get('/market', { query, signal }), // signed-in people also get which listings they saved
  saved: (query, signal) => get('/market/saved', { query, signal }),
  save: (id) => post(`/market/${id}/save`),
  unsave: (id) => del(`/market/${id}/save`),
  mine: (query, signal) => get('/market/mine', { query, signal }),
  get: (id, signal) => get(`/market/${id}`, { signal }),
  compare: (ids, signal) => get('/market/compare', { query: { ids: ids.join(',') }, signal, auth: false }),
  create: (body) => post('/market', body),
  update: (id, body) => put(`/market/${id}`, body),
  setStatus: (id, status) => patch(`/market/${id}/status`, { status }),
  remove: (id) => del(`/market/${id}`),
  takeDown: (id, reason) => post(`/market/${id}/takedown`, { reason }),
  restore: (id) => post(`/market/${id}/restore`),
};
