import { apiClient } from './client';
import { authApi } from './auth';

export const api = Object.assign(apiClient, {
  auth: authApi,
});

export default api;
