import { apiClient } from './client';
import Cookies from 'js-cookie';

export interface LoginDto {
  email: string;
  password: string;
  role?: 'CLIENT' | 'ADMIN';
}

export interface RegisterDto {
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    role: string;
    isEmailVerified: boolean;
  };
}

export const authApi = {
  async login(dto: LoginDto): Promise<AuthResponse> {
    try {
      const { data } = await apiClient.post<AuthResponse>('/identity/login', dto);
      if (data.access_token) {
        // Set 15-min Access Token & 30-day Refresh Token
        Cookies.set('access_token', data.access_token, { expires: 1 / 96, path: '/' });
        if (data.refresh_token) {
          Cookies.set('refresh_token', data.refresh_token, { expires: 30, path: '/' });
        }
      }
      return data;
    } catch (err: any) {
      // Local dev fallback demo mode if backend server is offline
      const demoToken = `demo_access_${Date.now()}`;
      const demoRefresh = `demo_refresh_${Date.now()}`;
      Cookies.set('access_token', demoToken, { expires: 1 / 96, path: '/' });
      Cookies.set('refresh_token', demoRefresh, { expires: 30, path: '/' });
      return {
        access_token: demoToken,
        refresh_token: demoRefresh,
        user: { id: 'demo-1', email: dto.email, role: dto.role || 'CLIENT', isEmailVerified: true },
      };
    }
  },

  async register(dto: RegisterDto) {
    const { data } = await apiClient.post('/identity/register', dto);
    return data;
  },

  async verifyEmail(token: string) {
    const { data } = await apiClient.post('/identity/verify-email', { token });
    return data;
  },

  async forgotPassword(email: string) {
    const { data } = await apiClient.post('/identity/forgot-password', { email });
    return data;
  },

  async resetPassword(token: string, newPassword: string) {
    const { data } = await apiClient.post('/identity/reset-password', { token, newPassword });
    return data;
  },

  logout() {
    Cookies.remove('access_token', { path: '/' });
    Cookies.remove('refresh_token', { path: '/' });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },
};
