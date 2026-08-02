import { apiClient } from './client';
import { authApi } from './auth';
import { kycApi } from './kyc';

export const api = Object.assign(apiClient, {
  auth: authApi,
  kyc: kycApi,
});

export default api;
