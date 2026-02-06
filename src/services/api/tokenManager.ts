import AsyncStorage from '@react-native-async-storage/async-storage';

// Storage keys for tokens
const ACCESS_TOKEN_KEY = '@gposvan_access_token';
const REFRESH_TOKEN_KEY = '@gposvan_refresh_token';
const TOKEN_EXPIRY_KEY = '@gposvan_token_expiry';

// In-memory cache for performance
let cachedToken: string | null = null;
let tokenExpiryTime: number | null = null;
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export interface TokenData {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
}

export interface TokenResponse {
  data: TokenData;
}

/**
 * Save tokens to AsyncStorage
 */
export const saveTokens = async (tokenResponse: TokenResponse): Promise<void> => {
  try {
    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    // Calculate expiry time (current time + expires_in seconds - 60 seconds buffer)
    const expiryTime = Date.now() + (expires_in - 60) * 1000;

    await Promise.all([
      AsyncStorage.setItem(ACCESS_TOKEN_KEY, access_token),
      AsyncStorage.setItem(REFRESH_TOKEN_KEY, refresh_token),
      AsyncStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString()),
    ]);

    // Update cache
    cachedToken = access_token;
    tokenExpiryTime = expiryTime;

    if (__DEV__) {
      console.log('[TokenManager] Tokens saved successfully');
    }
  } catch (error) {
    console.error('[TokenManager] Failed to save tokens:', error);
    throw error;
  }
};

/**
 * Get the current access token
 * Returns cached token if valid, otherwise retrieves from storage
 */
export const getAccessToken = async (): Promise<string | null> => {
  try {
    // Check if we have a valid cached token
    if (cachedToken && tokenExpiryTime && Date.now() < tokenExpiryTime) {
      return cachedToken;
    }

    // Load from storage
    const [token, expiryStr] = await Promise.all([
      AsyncStorage.getItem(ACCESS_TOKEN_KEY),
      AsyncStorage.getItem(TOKEN_EXPIRY_KEY),
    ]);

    if (!token || !expiryStr) {
      return null;
    }

    const expiryTime = parseInt(expiryStr, 10);

    // Check if token is expired
    if (Date.now() >= expiryTime) {
      if (__DEV__) {
        console.log('[TokenManager] Token expired, needs refresh');
      }
      return null;
    }

    // Update cache
    cachedToken = token;
    tokenExpiryTime = expiryTime;

    return token;
  } catch (error) {
    console.error('[TokenManager] Failed to get access token:', error);
    return null;
  }
};

/**
 * Get the refresh token from storage
 */
export const getRefreshToken = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('[TokenManager] Failed to get refresh token:', error);
    return null;
  }
};

/**
 * Check if token is valid (not expired)
 */
export const isTokenValid = async (): Promise<boolean> => {
  const token = await getAccessToken();
  return token !== null;
};

/**
 * Clear all stored tokens
 */
export const clearTokens = async (): Promise<void> => {
  try {
    await Promise.all([
      AsyncStorage.removeItem(ACCESS_TOKEN_KEY),
      AsyncStorage.removeItem(REFRESH_TOKEN_KEY),
      AsyncStorage.removeItem(TOKEN_EXPIRY_KEY),
    ]);

    // Clear cache
    cachedToken = null;
    tokenExpiryTime = null;

    if (__DEV__) {
      console.log('[TokenManager] Tokens cleared');
    }
  } catch (error) {
    console.error('[TokenManager] Failed to clear tokens:', error);
    throw error;
  }
};

/**
 * Set refreshing state to prevent multiple concurrent refresh calls
 */
export const setRefreshing = (refreshing: boolean, promise?: Promise<string | null>): void => {
  isRefreshing = refreshing;
  refreshPromise = promise || null;
};

/**
 * Get current refresh state
 */
export const getRefreshState = (): {
  isRefreshing: boolean;
  promise: Promise<string | null> | null;
} => ({
  isRefreshing,
  promise: refreshPromise,
});
