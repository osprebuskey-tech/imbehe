import { get, post } from './api';

export const reportApi = {
  create: (body) => post('/reports', body),
  summary: (signal) => get('/admin/moderation/summary', { signal }),
  adminList: (query, signal) => get('/admin/moderation/reports', { query, signal }),
  stats: (signal) => get('/admin/moderation/stats', { signal }),
  resolve: (id, body) => post(`/admin/moderation/reports/${id}/resolve`, body),
};
