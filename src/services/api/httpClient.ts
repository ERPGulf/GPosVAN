import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  AppTokenResponse,
  clearUserTokens,
  getRefreshState,
  getUserAccessToken,
  getUserRefreshToken,
  RefreshTokenResponse,
  saveUserTokens,
  setRefreshing,
  updateUserTokensAfterRefresh,
  UserTokenResponse,
} from './tokenManager';

// ─── Axios Instances ─────────────────────────────────────────────────────────

/**
 * Bare axios client for token-related API calls (no interceptors).
 * Used for: generate_token_secure, generate_token_secure_for_users,
 * create_refresh_token, getOfflinePOSUsers
 */
export const tokenClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Main API client — auto-attaches user Bearer token via interceptors.
 * Used for: products, customers, and all other authenticated API calls.
 */
export const apiClient = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ─── apiClient Interceptors ─────────────────────────────────────────────────

/**
 * Request interceptor — attaches user access token to all requests
 */
apiClient.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    try {
      const token = await getValidUserToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error('[HttpClient] Failed to get user token for request:', error);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

/**
 * Response interceptor — handles 401 by refreshing user token and retrying
 */
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // Handle 401 Unauthorized — user token might be expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (__DEV__) {
        console.log('[HttpClient] Received 401, attempting user token refresh...');
      }

      try {
        const newToken = await refreshUserTokenFlow();

        if (newToken) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        console.error('[HttpClient] User token refresh failed:', refreshError);
      }

      // Refresh failed — clear tokens (user will need to re-login)
      await clearUserTokens();
    }

    console.error('[HttpClient] Request error:', error.message);
    return Promise.reject(error);
  },
);

// ─── App Token (Transient, Not Stored) ───────────────────────────────────────

/**
 * Generate an app token using API credentials.
 * The app token is NOT stored — it is returned for immediate use.
 */
export const generateAppToken = async (): Promise<string> => {
  try {
    const response = await tokenClient.post<{ data: AppTokenResponse['data'] }>(
      '/gpos.gpos.pos.generate_token_secure',
      {
        api_key: process.env.EXPO_PUBLIC_API_KEY,
        api_secret: process.env.EXPO_PUBLIC_API_SECRET,
        app_key: process.env.EXPO_PUBLIC_APP_KEY,
      },
    );

    const tokenData = response.data.data;

    if (!tokenData?.access_token) {
      throw new Error('Invalid app token response — missing access_token');
    }

    if (__DEV__) {
      console.log('[HttpClient] App token generated successfully');
    }

    return tokenData.access_token;
  } catch (error) {
    console.error('[HttpClient] Failed to generate app token:', error);
    throw error;
  }
};

// ─── User Token (Persisted in SecureStore) ───────────────────────────────────

/**
 * Generate a user token by calling generate_token_secure_for_users.
 * Requires a valid app token as Bearer authorization.
 * Saves user tokens to SecureStore on success.
 */
export const generateUserToken = async (
  email: string,
  password: string,
  appToken: string,
): Promise<UserTokenResponse['data']> => {
  try {
    const params = new URLSearchParams();
    params.append('username', email);
    params.append('password', password);
    params.append('app_key', process.env.EXPO_PUBLIC_APP_KEY || '');

    const response = await tokenClient.get<{ data: UserTokenResponse['data'] }>(
      '/gpos.gpos.pos.generate_token_secure_for_users',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Bearer ${appToken}`,
        },
        params,
      },
    );

    const data = response.data.data;

    if (!data?.token?.access_token) {
      throw new Error('Invalid user token response — missing access_token');
    }

    // Save user tokens to SecureStore
    await saveUserTokens(data.token);

    if (__DEV__) {
      console.log('[HttpClient] User token generated and saved successfully');
    }

    return data;
  } catch (error) {
    console.error('[HttpClient] Failed to generate user token:', error);
    throw error;
  }
};

// ─── Token Refresh ───────────────────────────────────────────────────────────

/**
 * Refresh the user access token using the refresh token.
 * Generates a fresh app token first, then calls create_refresh_token.
 */
const refreshUserTokenFlow = async (): Promise<string | null> => {
  // Check if a refresh is already in progress
  const refreshState = getRefreshState();
  if (refreshState.isRefreshing && refreshState.promise) {
    return refreshState.promise;
  }

  const promise = (async (): Promise<string | null> => {
    try {
      setRefreshing(true);

      const refreshToken = await getUserRefreshToken();
      if (!refreshToken) {
        if (__DEV__) {
          console.log('[HttpClient] No refresh token available');
        }
        return null;
      }

      // Generate a fresh app token for the refresh call
      const appToken = await generateAppToken();

      // Create form data for the refresh request
      const formData = new FormData();
      formData.append('refresh_token', refreshToken);

      const response = await tokenClient.get<{ data: RefreshTokenResponse['data'] }>(
        '/gpos.gpos.pos.create_refresh_token',
        {
          headers: {
            Authorization: `Bearer ${appToken}`,
          },
          params: { refresh_token: refreshToken },
        },
      );

      const data = response.data.data;

      if (!data?.access_token) {
        console.error('[HttpClient] Invalid refresh token response');
        return null;
      }

      // Update stored tokens
      await updateUserTokensAfterRefresh(data);

      if (__DEV__) {
        console.log('[HttpClient] User token refreshed successfully');
      }

      return data.access_token;
    } catch (error) {
      console.error('[HttpClient] Token refresh failed:', error);
      return null;
    } finally {
      setRefreshing(false);
    }
  })();

  setRefreshing(true, promise);
  return promise;
};

/**
 * Get a valid user access token — from cache/SecureStore, or trigger refresh.
 */
const getValidUserToken = async (): Promise<string | null> => {
  // Check if a refresh is already in progress
  const refreshState = getRefreshState();
  if (refreshState.isRefreshing && refreshState.promise) {
    return refreshState.promise;
  }

  // Check for valid cached/stored token
  const existingToken = await getUserAccessToken();
  if (existingToken) {
    return existingToken;
  }

  // Token expired — try to refresh
  return refreshUserTokenFlow();
};
