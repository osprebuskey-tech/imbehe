import { get } from './api';

export const profileApi = {
  get: (id, signal) => get(`/profiles/${id}`, { signal, auth: true }),
};
