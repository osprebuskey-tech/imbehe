import { get } from './api';

// Public. When someone is signed in their token is sent too, so a verified provider also gets the open requests meant for them.
export const discoverApi = {
  all: (signal) => get('/discover', { signal }),
};
