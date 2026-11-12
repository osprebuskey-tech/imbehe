import { get, post, put, del } from './api';

const withImage = (file, fields = {}) => {
  const form = new FormData();
  Object.entries(fields).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null) form.append(k, v); });
  form.append('image', file);
  return form;
};

export const advertApi = {
  list: (signal) => get('/adverts', { signal, auth: false }), // the welcome page: active adverts that have not ended
  manage: (signal) => get('/adverts/manage', { signal }), // super administrator: everything
  create: (fields, file) => post('/adverts', withImage(file, fields)),
  update: (id, body) => put(`/adverts/${id}`, body),
  replaceImage: (id, file) => post(`/adverts/${id}/image`, withImage(file)),
  remove: (id) => del(`/adverts/${id}`),
};
