import { OfflineUser } from '@/src/infrastructure/db/offlineUsers.repository';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

const AUTH_STORAGE_KEY = '@gposvan_auth_user';

interface AuthContextType {
  user: OfflineUser | null;
  isLoading: boolean;
  login: (user: OfflineUser) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Validate that the stored data has required user fields
 */
const isValidUser = (data: unknown): data is OfflineUser => {
  if (!data || typeof data !== 'object') return false;
  const user = data as Record<string, unknown>;
  // At minimum, a valid user should have a 'name' field (primary key)
  return typeof user.name === 'string' && user.name.length > 0;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<OfflineUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load user from storage on app start
  useEffect(() => {
    loadStoredUser();
  }, []);

  const loadStoredUser = async () => {
    try {
      const storedUser = await AsyncStorage.getItem(AUTH_STORAGE_KEY);

      if (__DEV__) console.log('[Auth] Loaded from AsyncStorage:', storedUser ? 'found' : 'empty');

      if (storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser);

          // Validate the parsed data
          if (isValidUser(parsedUser)) {
            if (__DEV__) console.log('[Auth] Valid user found:', parsedUser.offlineUsername);
            setUser(parsedUser);
          } else {
            // Invalid data - clear corrupted storage
            console.warn('[Auth] Invalid user data in storage, clearing...');
            await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
          }
        } catch (parseError) {
          // JSON parse failed - clear corrupted storage
          console.error('[Auth] Failed to parse stored user, clearing corrupted data:', parseError);
          await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    } catch (error) {
      // AsyncStorage read failed - log but don't crash
      console.error('[Auth] Failed to load stored user:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (userData: OfflineUser) => {
    // Validate before saving
    if (!isValidUser(userData)) {
      throw new Error('Invalid user data: missing required fields');
    }

    try {
      if (__DEV__) console.log('[Auth] Saving user to AsyncStorage:', userData.offlineUsername);
      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(userData));
      setUser(userData);
      if (__DEV__) console.log('[Auth] User saved successfully!');
    } catch (error) {
      console.error('[Auth] Failed to save user:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      if (__DEV__) console.log('[Auth] Logging out, clearing AsyncStorage...');
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      setUser(null);
      if (__DEV__) console.log('[Auth] Logged out successfully!');
    } catch (error) {
      console.error('[Auth] Failed to logout:', error);
      // Still clear local state even if AsyncStorage fails
      setUser(null);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        logout,
        isAuthenticated: !!user,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
