import { getAllCustomers, syncAllCustomers } from '@/src/infrastructure/db/customers.repository';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';

/**
 * Hook to fetch customers with offline-first behavior.
 * - Tries to fetch from API and sync to local database
 * - If API fails (offline), falls back to local SQLite data
 * - Always returns data from the local database for consistency
 */
export const useCustomers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      try {
        // Try to fetch from API and sync to local database
        await syncAllCustomers(drizzleDb);
      } catch (error) {
        // API failed (likely offline) - log but don't throw
        console.log('[useCustomers] API fetch failed, using local data:', error);
      }

      // Always return customers from local database
      // This works even if API failed - we use cached data
      return await getAllCustomers(drizzleDb);
    },
    retry: 1, // Reduce retries since we have fallback
    refetchOnWindowFocus: false,
    // Consider data fresh for 5 minutes to avoid unnecessary refetches
    staleTime: 5 * 60 * 1000,
  });
};

/**
 * Hook to get customers directly from the local database without making an API call.
 * Useful when you explicitly want only cached data.
 */
export const useLocalCustomers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['local-customers'],
    queryFn: () => getAllCustomers(drizzleDb),
    retry: 1,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook to manually sync customers from the API to the local database.
 * Returns sync function and loading state.
 */
export const useSyncCustomers = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);
  const queryClient = useQueryClient();

  const sync = useCallback(async () => {
    await syncAllCustomers(drizzleDb);
    // Invalidate queries to refetch with new data
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['local-customers'] });
  }, [drizzleDb, queryClient]);

  return { sync };
};
