import {
  checkDuplicateCustomer,
  insertCustomer,
  NewCustomer,
  updateCustomerIdAfterSync,
  updateCustomerSyncStatus,
} from '@/src/infrastructure/db/customers.repository';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useSQLiteContext } from 'expo-sqlite';
import { createCustomer as createCustomerApi } from '../services/customerApi.service';
import { CreateCustomerParams } from '../types/customerApi.types';

export type CreateCustomerError =
  | {
      type: 'duplicate';
      field: 'name' | 'phoneNo' | 'vatNumber';
      message: string;
    }
  | {
      type: 'api_error';
      message: string;
    };

/**
 * Hook to create a new customer with offline-first behavior.
 * 1. Validates for duplicates locally
 * 2. Saves to local SQLite with temp ID (TEMP_xxx) and syncStatus='pending'
 * 3. Attempts API sync
 * 4. On success: replaces temp ID with API ID, sets syncStatus='synced'
 * 5. On failure: keeps temp ID and 'pending' for later retry
 */
export const useCreateCustomer = () => {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (customer: NewCustomer): Promise<string> => {
      console.log('[useCreateCustomer] mutationFn called with:', customer);

      // Step 1: Check for duplicates locally
      console.log('[useCreateCustomer] Step 1: Checking for duplicates...');
      const duplicateField = await checkDuplicateCustomer(drizzleDb, customer);
      console.log('[useCreateCustomer] Duplicate check result:', duplicateField);

      if (duplicateField) {
        const fieldLabels = {
          name: 'Customer Name',
          phoneNo: 'Mobile Number',
          vatNumber: 'VAT Number',
        };
        const error: CreateCustomerError = {
          type: 'duplicate',
          field: duplicateField,
          message: `A customer with this ${fieldLabels[duplicateField]} already exists`,
        };
        console.log('[useCreateCustomer] Throwing duplicate error:', error);
        throw error;
      }

      // Step 2: Insert into local database with temp ID
      console.log('[useCreateCustomer] Step 2: Inserting into local database with temp ID...');
      const tempId = await insertCustomer(drizzleDb, customer);
      console.log('[useCreateCustomer] Customer inserted with temp ID:', tempId);

      // Step 3: Attempt API sync
      console.log('[useCreateCustomer] Step 3: Attempting API sync...');
      try {
        const apiParams: CreateCustomerParams = {
          customer_name: customer.name,
          mobile_no: customer.phoneNo,
          vat_number: customer.vatNumber,
          address_line1: customer.addressLine1,
          address_line2: customer.addressLine2,
          building_number: customer.buildingNo,
          city: customer.city,
          pb_no: customer.poBoxNo,
          company: customer.company,
        };

        console.log('[useCreateCustomer] Calling API with params:', apiParams);
        const apiResponse = await createCustomerApi(apiParams);
        console.log('[useCreateCustomer] API response:', apiResponse);

        // Step 4: Replace temp ID with API ID
        if (apiResponse.data?.id) {
          const apiId = apiResponse.data.id;
          console.log('[useCreateCustomer] Replacing temp ID with API ID:', apiId);
          await updateCustomerIdAfterSync(drizzleDb, tempId, apiId);
          console.log('[useCreateCustomer] ID replaced and sync status updated to synced');
          return apiId; // Return the real API ID
        } else {
          // API succeeded but didn't return ID - mark as synced anyway
          await updateCustomerSyncStatus(drizzleDb, tempId, 'synced');
          console.log('[useCreateCustomer] API success but no ID returned, marked as synced');
          return tempId;
        }
      } catch (apiError) {
        // API failed (offline or error) - keep temp ID and pending status
        console.log('[useCreateCustomer] API sync failed, will retry later:', apiError);
        return tempId; // Return temp ID for now
      }
    },
    onSuccess: (data) => {
      console.log('[useCreateCustomer] onSuccess called with:', data);
      // Invalidate queries to refresh customer list
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['local-customers'] });
    },
    onError: (error) => {
      console.error('[useCreateCustomer] onError called with:', error);
    },
  });
};
