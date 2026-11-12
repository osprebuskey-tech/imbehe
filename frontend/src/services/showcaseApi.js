import { get } from './api';

export const showcaseApi = {
  list: (signal) => get('/posts/showcase', { signal, auth: false }), // welcome page: recent popular posts from verified people
};
