import axios from 'axios';
import Cookies from 'js-cookie';

const API_BASE_URL = typeof window !== 'undefined' ? '/api' : (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001');

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach Access Token
apiClient.interceptors.request.use((config) => {
  const token = Cookies.get('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Helper function to perform token refresh
export async function refreshPortalToken(): Promise<string | null> {
  try {
    const refreshToken = Cookies.get('refresh_token');
    const { data } = await axios.post(
      `${API_BASE_URL}/auth/refresh`,
      { refreshToken },
      { withCredentials: true }
    );

    const token = data.access_token || data.accessToken;
    const rToken = data.refresh_token || data.refreshToken;

    if (token) {
      Cookies.set('access_token', token, { expires: 7, path: '/' });
      if (rToken) Cookies.set('refresh_token', rToken, { expires: 30, path: '/' });
      apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      return token;
    }
  } catch {
    // silent fallback
  }
  return null;
}

// Proactive background auto-refresh every 10 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    refreshPortalToken();
  }, 10 * 60 * 1000);
}

// Response Interceptor: Auto-Refresh Access Token on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest?.url || '';

    const isAuthEndpoint =
      url.includes('/auth/login') ||
      url.includes('/auth/register') ||
      url.includes('/auth/verify-email') ||
      url.includes('/auth/refresh');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;

      const newToken = await refreshPortalToken();
      if (newToken) {
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return apiClient(originalRequest);
      }

      // If refresh failed, clear cookies and redirect to login
      Cookies.remove('access_token', { path: '/' });
      Cookies.remove('refresh_token', { path: '/' });

      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/auth/login')) {
        window.location.href = '/auth/login';
      }
    }

    return Promise.reject(error);
  },
);
