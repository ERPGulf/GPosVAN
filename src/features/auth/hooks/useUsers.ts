import {
  getUsersFromDb,
  syncUsers,
  UserApiResponse,
} from '@/src/infrastructure/db/users.repository';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { userApi } from '../services/user.service';

/**
 * Hook to fetch users with offline-first behavior.
 * - Tries to fetch from API and sync to local database
 * - If API fails (offline), falls back to local SQLite data
 * - Always returns data from the local database for consistency
 */
export const useUsers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      try {
        // Try to fetch from API
        const response = await userApi();
        // console.log('API fetch success:', response);

        // API returns { data: [...users] }
        const apiUsers: UserApiResponse[] = response?.data || [];
        await syncUsers(drizzleDb, apiUsers);
      } catch (error) {
        // API failed (likely offline) - log but don't throw
        console.log('API fetch failed, using local data:', error);
      }

      // Always return users from local database
      // This works even if API failed - we use cached data
      console.log('returning users from local database');
      return await getUsersFromDb(drizzleDb);
    },
    retry: 1, // Reduce retries since we have fallback
    refetchOnWindowFocus: false,
    // Consider data fresh for 5 minutes to avoid unnecessary refetches
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook to get users directly from the local database without making an API call.
 * Useful when you explicitly want only cached data.
 */
export const useLocalUsers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['local-users'],
    queryFn: () => getUsersFromDb(drizzleDb),
    retry: 1,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook to manually sync users from the API to the local database.
 * Returns sync function and loading state.
 */
export const useSyncUsers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);
  const queryClient = useQueryClient();

  const sync = useCallback(async () => {
    const response = await userApi();
    const apiUsers: UserApiResponse[] = response?.data || [];
    await syncUsers(drizzleDb, apiUsers);
    // Invalidate queries to refetch with new data
    queryClient.invalidateQueries({ queryKey: ['users'] });
    queryClient.invalidateQueries({ queryKey: ['local-users'] });
    return apiUsers;
  }, [drizzleDb, queryClient]);

  return { sync };
};

// Re-export old hook names for backward compatibility
// export const useOfflineUsers = useUsers;
// export const useLocalOfflineUsers = useLocalUsers;
// export const useSyncOfflineUsers = useSyncUsers;
