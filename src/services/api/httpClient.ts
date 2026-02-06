import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  clearTokens,
  getAccessToken,
  getRefreshState,
  saveTokens,
  setRefreshing,
  TokenResponse,
} from './tokenManager';

// Main API client
export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Create axios instance for token generation (without interceptors to avoid circular calls)
const tokenClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Request interceptor - Attaches Bearer token to all requests
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await getValidToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('[HttpClient] Failed to get token for request:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/**
 * Response interceptor - Handles 401 errors by refreshing token and retrying
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized - Token might be expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (__DEV__) {
        console.log('[HttpClient] Received 401, attempting token refresh...');
      }

      try {
        // Clear existing token and generate new one
        await clearTokens();
        const newToken = await getValidToken();

        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        console.error('[HttpClient] Token refresh failed:', refreshError);
      }
    }

    console.error('[HttpClient] Request error:', error.message);
    return Promise.reject(error);
  },
);

/**
 * Generate a new token using API credentials
 * Uses tokenClient to avoid interceptor loops
 */
const generateToken = async (): Promise<TokenResponse | null> => {
  try {
    const response = await tokenClient.post<{ data: TokenResponse['data'] }>(
      '/gpos.gpos.pos.generate_token_secure',
      {
        api_key: process.env.EXPO_PUBLIC_API_KEY,
        api_secret: process.env.EXPO_PUBLIC_API_SECRET,
        app_key: process.env.EXPO_PUBLIC_APP_KEY,
      },
    );

    // API returns { data: { access_token, ... } }, axios wraps it as response.data
    const tokenData = response.data.data;

    if (!tokenData?.access_token) {
      console.error('[HttpClient] Invalid token response - missing access_token');
      return null;
    }

    const tokenResponse: TokenResponse = { data: tokenData };

    if (__DEV__) {
      console.log('[HttpClient] Token generated successfully');
    }

    return tokenResponse;
  } catch (error) {
    console.error('[HttpClient] Failed to generate token:', error);
    return null;
  }
};

/**
 * Get a valid access token - either from storage or by generating a new one
 * Prevents concurrent refresh calls using a singleton promise pattern
 */
const getValidToken = async (): Promise<string | null> => {
  // Check if a refresh is already in progress
  const refreshState = getRefreshState();
  if (refreshState.isRefreshing && refreshState.promise) {
    return refreshState.promise;
  }

  // Check if we have a valid cached token
  const existingToken = await getAccessToken();
  if (existingToken) {
    return existingToken;
  }

  // Need to generate a new token
  const refreshPromise = (async (): Promise<string | null> => {
    try {
      setRefreshing(true);

      const tokenResponse = await generateToken();
      if (tokenResponse) {
        await saveTokens(tokenResponse);
        return tokenResponse.data.access_token;
      }
      return null;
    } finally {
      setRefreshing(false);
    }
  })();

  setRefreshing(true, refreshPromise);
  return refreshPromise;
};
