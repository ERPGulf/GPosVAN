import {
  getAllBarcodes,
  getAllCategories,
  getAllProducts,
  getProductsWithUom,
  syncAllProducts,
} from '@/src/infrastructure/db/products.repository';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';

/**
 * Hook to fetch products with UOM data using offline-first behavior.
 * - Tries to sync products from API to local database
 * - If API fails (offline), falls back to local SQLite data
 * - Returns ProductWithUom[] from a LEFT JOIN of products and unitOfMeasures
 */
export const useProducts = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      try {
        // Try to sync from API
        await syncAllProducts(drizzleDb);
      } catch (error) {
        // API failed (likely offline) - log but don't throw
        console.log('Product sync failed, using local data:', error);
      }

      // Always return products with UOM data from local database
      return await getProductsWithUom(drizzleDb);
    },
    retry: 1,
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
  });
};

/**
 * Hook to get products directly from the local database without making an API call.
 * Useful when you explicitly want only cached data.
 */
export const useLocalProducts = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['local-products'],
    queryFn: () => getAllProducts(drizzleDb),
    retry: 1,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook to get categories from the local database.
 */
export const useCategories = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['categories'],
    queryFn: () => getAllCategories(drizzleDb),
    retry: 1,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook to get all barcodes from the local database.
 */
export const useBarcodes = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);

  return useQuery({
    queryKey: ['barcodes'],
    queryFn: () => getAllBarcodes(drizzleDb),
    retry: 1,
    refetchOnWindowFocus: false,
  });
};

/**
 * Hook to manually sync products from the API to the local database.
 * Returns sync function and loading state.
 */
export const useSyncProducts = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);
  const queryClient = useQueryClient();

  const sync = useCallback(async () => {
    await syncAllProducts(drizzleDb);
    // Invalidate queries to refetch with new data
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['local-products'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
  }, [drizzleDb, queryClient]);

  return { sync };
};
