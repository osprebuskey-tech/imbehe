import { get, post, patch, del } from './api';

export const authApi = {
  register: (body) => post('/auth/register', body, { auth: false }),
  login: (body) => post('/auth/login', body, { auth: false }),
  logout: () => post('/auth/logout'),
  me: (opts) => get('/auth/me', opts),
  updateMe: (body) => patch('/auth/me', body),
  uploadAvatar: (file) => {
    const form = new FormData();
    form.append('image', file);
    return post('/auth/me/avatar', form);
  },
  removeAvatar: () => del('/auth/me/avatar'),
  uploadCover: (file) => {
    const form = new FormData();
    form.append('image', file);
    return post('/auth/me/cover', form);
  },
  removeCover: () => del('/auth/me/cover'),
  changePassword: (body) => post('/auth/change-password', body),
  verifyEmail: (token) => post('/auth/verify-email', { token }, { auth: false }),
  resendVerification: () => post('/auth/resend-verification'),
  forgotPassword: (email) => post('/auth/forgot-password', { email }, { auth: false }),
  resetPassword: (body) => post('/auth/reset-password', body, { auth: false }),
};
