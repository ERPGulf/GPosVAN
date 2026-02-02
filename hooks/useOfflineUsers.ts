import { useQuery, useQueryClient } from '@tanstack/react-query';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { offlineUserApi } from '../api/offlineUserApi';
import {
  getOfflineUsersFromDb,
  OfflineUserApiResponse,
  syncOfflineUsers,
} from '../db/OfflineUsersService';

/**
 * Hook to fetch offline users with offline-first behavior.
 * - Tries to fetch from API and sync to local database
 * - If API fails (offline), falls back to local SQLite data
 * - Always returns data from the local database for consistency
 */
export const useOfflineUsers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['offline-users'],
    queryFn: async () => {
      try {
        // Try to fetch from API
        console.log('Fetching offline users from API');
        const response = await offlineUserApi();

        // API returns { data: [...users] }
        const users: OfflineUserApiResponse[] = response?.data || [];
        console.log('API fetch success:', users);
        await syncOfflineUsers(drizzleDb, users);
      } catch (error) {
        // API failed (likely offline) - log but don't throw
        console.log('API fetch failed, using local data:', error);
      }

      // Always return users from local database
      // This works even if API failed - we use cached data
      console.log('returning users from local database');
      return await getOfflineUsersFromDb(drizzleDb);
    },
    retry: 1, // Reduce retries since we have fallback
    refetchOnWindowFocus: false,
    // Consider data fresh for 5 minutes to avoid unnecessary refetches
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook to get offline users directly from the local database without making an API call.
 * Useful when you explicitly want only cached data.
 */
export const useLocalOfflineUsers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['local-offline-users'],
    queryFn: () => getOfflineUsersFromDb(drizzleDb),
    retry: 1,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook to manually sync offline users from the API to the local database.
 * Returns sync function and loading state.
 */
export const useSyncOfflineUsers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);
  const queryClient = useQueryClient();

  const sync = useCallback(async () => {
    const response = await offlineUserApi();
    const users: OfflineUserApiResponse[] = response?.data || [];
    await syncOfflineUsers(drizzleDb, users);
    // Invalidate queries to refetch with new data
    queryClient.invalidateQueries({ queryKey: ['offline-users'] });
    queryClient.invalidateQueries({ queryKey: ['local-offline-users'] });
    return users;
  }, [drizzleDb, queryClient]);

  return { sync };
};
