import * as SecureStore from 'expo-secure-store';
import { logger } from '@/src/services/logger';

// SecureStore keys for user tokens
const USER_ACCESS_TOKEN_KEY = 'GPOS_USER_ACCESS_TOKEN';
const USER_REFRESH_TOKEN_KEY = 'GPOS_USER_REFRESH_TOKEN';
const USER_TOKEN_EXPIRY_KEY = 'GPOS_USER_TOKEN_EXPIRY';

// In-memory cache for performance
let cachedUserToken: string | null = null;
let userTokenExpiryTime: number | null = null;

// Refresh state to prevent concurrent refresh calls
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AppTokenData {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
}

export interface AppTokenResponse {
  data: AppTokenData;
}

export interface UserTokenData {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
  refresh_token: string;
}

export interface UserTokenResponse {
  data: {
    token: UserTokenData;
    user: {
      id: string;
      phone: string;
      email: string;
    };
    time: string;
    branch_id: string;
  };
}

export interface RefreshTokenResponse {
  data: {
    access_token: string;
    expires_in: number;
    token_type: string;
    scope: string;
    refresh_token: string;
  };
}

// ─── User Token Management (SecureStore) ─────────────────────────────────────

/**
 * Save user tokens to SecureStore
 */
export const saveUserTokens = async (tokenData: UserTokenData): Promise<void> => {
  try {
    const { access_token, refresh_token, expires_in } = tokenData;

    // Calculate expiry time (current time + expires_in seconds - 60 seconds buffer)
    const expiryTime = Date.now() + (expires_in - 60) * 1000;

    await Promise.all([
      SecureStore.setItemAsync(USER_ACCESS_TOKEN_KEY, access_token),
      SecureStore.setItemAsync(USER_REFRESH_TOKEN_KEY, refresh_token),
      SecureStore.setItemAsync(USER_TOKEN_EXPIRY_KEY, expiryTime.toString()),
    ]);

    // Update cache
    cachedUserToken = access_token;
    userTokenExpiryTime = expiryTime;

    if (__DEV__) {
      console.log('[TokenManager] User tokens saved to SecureStore');
    }
  } catch (error) {
    console.error('[TokenManager] Failed to save user tokens:', error);
    logger.recordError(error, 'TokenManager.saveTokens');
    throw error;
  }
};

/**
 * Get the current user access token.
 * Returns cached token if valid, otherwise retrieves from SecureStore.
 */
export const getUserAccessToken = async (): Promise<string | null> => {
  try {
    // Check if we have a valid cached token
    if (cachedUserToken && userTokenExpiryTime && Date.now() < userTokenExpiryTime) {
      return cachedUserToken;
    }

    // Load from SecureStore
    const [token, expiryStr] = await Promise.all([
      SecureStore.getItemAsync(USER_ACCESS_TOKEN_KEY),
      SecureStore.getItemAsync(USER_TOKEN_EXPIRY_KEY),
    ]);

    if (!token || !expiryStr) {
      return null;
    }

    const expiryTime = parseInt(expiryStr, 10);

    // Check if token is expired
    if (Date.now() >= expiryTime) {
      if (__DEV__) {
        console.log('[TokenManager] User token expired, needs refresh');
      }
      return null;
    }

    // Update cache
    cachedUserToken = token;
    userTokenExpiryTime = expiryTime;

    return token;
  } catch (error) {
    console.error('[TokenManager] Failed to get user access token:', error);
    logger.recordError(error, 'TokenManager.getAccessToken');
    return null;
  }
};

/**
 * Get the user refresh token from SecureStore
 */
export const getUserRefreshToken = async (): Promise<string | null> => {
  try {
    return await SecureStore.getItemAsync(USER_REFRESH_TOKEN_KEY);
  } catch (error) {
    console.error('[TokenManager] Failed to get user refresh token:', error);
    logger.recordError(error, 'TokenManager.getRefreshToken');
    return null;
  }
};

/**
 * Check if user token is valid (not expired)
 */
export const isUserTokenValid = async (): Promise<boolean> => {
  const token = await getUserAccessToken();
  return token !== null;
};

/**
 * Clear all stored user tokens
 */
export const clearUserTokens = async (): Promise<void> => {
  try {
    await Promise.all([
      SecureStore.deleteItemAsync(USER_ACCESS_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_REFRESH_TOKEN_KEY),
      SecureStore.deleteItemAsync(USER_TOKEN_EXPIRY_KEY),
    ]);

    // Clear cache
    cachedUserToken = null;
    userTokenExpiryTime = null;

    if (__DEV__) {
      console.log('[TokenManager] User tokens cleared');
    }
  } catch (error) {
    console.error('[TokenManager] Failed to clear user tokens:', error);
    logger.recordError(error, 'TokenManager.clearTokens');
    throw error;
  }
};

/**
 * Update user tokens after a refresh (saves new access + refresh token)
 */
export const updateUserTokensAfterRefresh = async (
  refreshData: RefreshTokenResponse['data'],
): Promise<void> => {
  await saveUserTokens({
    access_token: refreshData.access_token,
    expires_in: refreshData.expires_in,
    token_type: refreshData.token_type,
    scope: refreshData.scope,
    refresh_token: refreshData.refresh_token,
  });
};

// ─── Refresh State Management ────────────────────────────────────────────────

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
