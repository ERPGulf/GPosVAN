import {
  createCustomer as createCustomerApi,
  fetchCustomers,
} from '@/src/features/customers/services/customerApi.service';
import {
  ApiCustomer,
  GetCustomerListResponse,
} from '@/src/features/customers/types/customerApi.types';
import { eq, getTableColumns, sql, SQL } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { randomUUID } from 'expo-crypto';
import { customers } from './schema';

/**
 * Build conflict update columns for upsert operations.
 * Uses the excluded keyword to reference the incoming row's values.
 */
const buildConflictUpdateColumns = <T extends SQLiteTable, Q extends keyof T['_']['columns']>(
  table: T,
  columns: Q[],
) => {
  const cls = getTableColumns(table);
  return columns.reduce(
    (acc, column) => {
      const colName = cls[column].name;
      acc[column] = sql.raw(`excluded.${colName}`);
      return acc;
    },
    {} as Record<Q, SQL>,
  );
};

/**
 * Map API customer to database customer entity.
 */
const mapApiCustomerToEntity = (customer: ApiCustomer) => ({
  id: customer.id,
  name: customer.customer_name,
  phoneNo: customer.mobile_no,
  isDefault: customer.custom_default_pos === 1,
  isDisabled: customer.disabled === 1,
  vatNumber: customer.tax_id,
  addressLine1: customer.customer_primary_address,
  addressLine2: null,
  buildingNo: null,
  poBoxNo: null,
  city: null,
  company: null,
  customerGroup: customer.customer_group,
  customerRegistrationNo: customer.custom_buyer_id,
  customerRegistrationType: customer.custom_buyer_id_type,
  syncStatus: 'synced',
});

/**
 * Sync customers from API response to the database using upsert.
 * First updates local TEMP_ records to use API IDs, then upserts all API data.
 */
const syncCustomers = async (
  db: ExpoSQLiteDatabase,
  customerList: ApiCustomer[],
): Promise<void> => {
  if (!customerList || customerList.length === 0) return;

  // Step 1: For local TEMP_ records that match API records by phone,
  // update them to use the API ID (prevents phone_no unique constraint failures)
  for (const apiCustomer of customerList) {
    if (apiCustomer.mobile_no) {
      const localMatch = await db
        .select({ id: customers.id })
        .from(customers)
        .where(eq(customers.phoneNo, apiCustomer.mobile_no))
        .limit(1);

      if (localMatch.length > 0 && localMatch[0].id.startsWith('TEMP_')) {
        // Update TEMP_ record to use the API ID
        await db
          .update(customers)
          .set({ id: apiCustomer.id, syncStatus: 'synced' })
          .where(eq(customers.id, localMatch[0].id));
      }
    }
  }

  // Step 2: Upsert all API data
  const customerData = customerList.map(mapApiCustomerToEntity);

  const BATCH_SIZE = 50;
  for (let i = 0; i < customerData.length; i += BATCH_SIZE) {
    const batch = customerData.slice(i, i + BATCH_SIZE);

    await db
      .insert(customers)
      .values(batch)
      .onConflictDoUpdate({
        target: customers.id,
        set: buildConflictUpdateColumns(customers, [
          'name',
          'phoneNo',
          'isDefault',
          'isDisabled',
          'vatNumber',
          'addressLine1',
          'addressLine2',
          'buildingNo',
          'poBoxNo',
          'city',
          'company',
          'customerGroup',
          'customerRegistrationNo',
          'customerRegistrationType',
          'syncStatus',
        ]),
      });
  }
};

/**
 * Sync all customer data from API to local database.
 * Fetches from API and upserts customers.
 */
export const syncAllCustomers = async (db: ExpoSQLiteDatabase): Promise<void> => {
  try {
    if (__DEV__) {
      console.log('[CustomersRepository] Starting customer sync...');
    }

    const response: GetCustomerListResponse = await fetchCustomers();

    if (!response?.data || response.data.length === 0) {
      if (__DEV__) {
        console.log('[CustomersRepository] No customers to sync');
      }
      return;
    }

    await syncCustomers(db, response.data);

    if (__DEV__) {
      console.log(`[CustomersRepository] Synced ${response.data.length} customers successfully`);
    }
  } catch (error) {
    console.error('[CustomersRepository] Customer sync failed:', error);
    throw error;
  }
};

/**
 * Get all customers from the local database.
 */
export const getAllCustomers = async (db: ExpoSQLiteDatabase) => {
  return db.select().from(customers);
};

/**
 * Get a customer by ID from the local database.
 */
export const getCustomerById = async (db: ExpoSQLiteDatabase, customerId: string) => {
  return db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
};

/**
 * Search customers by name or phone number.
 */
export const searchCustomers = async (db: ExpoSQLiteDatabase, searchTerm: string) => {
  const term = `%${searchTerm}%`;
  return db
    .select()
    .from(customers)
    .where(sql`${customers.name} LIKE ${term} OR ${customers.phoneNo} LIKE ${term}`);
};

/**
 * Clear all customer data from the database.
 */
export const clearAllCustomerData = async (db: ExpoSQLiteDatabase): Promise<void> => {
  await db.delete(customers);
};

// ============ Offline-First Customer Creation Functions ============

export type NewCustomer = {
  name: string;
  phoneNo: string;
  vatNumber: string;
  addressLine1: string;
  addressLine2: string;
  buildingNo: string;
  city: string;
  poBoxNo: string;
  company: string;
};

/**
 * Check if a customer with the same name, phone, or VAT number already exists.
 * Returns the field that has a duplicate, or null if no duplicates.
 */
export const checkDuplicateCustomer = async (
  db: ExpoSQLiteDatabase,
  customer: NewCustomer,
): Promise<'name' | 'phoneNo' | 'vatNumber' | null> => {
  // Check name
  const nameCheck = await db
    .select()
    .from(customers)
    .where(eq(customers.name, customer.name))
    .limit(1);
  if (nameCheck.length > 0) return 'name';

  // Check phone
  const phoneCheck = await db
    .select()
    .from(customers)
    .where(eq(customers.phoneNo, customer.phoneNo))
    .limit(1);
  if (phoneCheck.length > 0) return 'phoneNo';

  // Check VAT
  const vatCheck = await db
    .select()
    .from(customers)
    .where(eq(customers.vatNumber, customer.vatNumber))
    .limit(1);
  if (vatCheck.length > 0) return 'vatNumber';

  return null;
};

/**
 * Insert a new customer with syncStatus='pending'.
 * Returns the newly created customer ID.
 */
export const insertCustomer = async (
  db: ExpoSQLiteDatabase,
  customer: NewCustomer,
): Promise<string> => {
  // Use TEMP_ prefix to identify offline-created customers
  const id = `TEMP_${randomUUID()}`;

  await db.insert(customers).values({
    id,
    name: customer.name,
    phoneNo: customer.phoneNo,
    vatNumber: customer.vatNumber,
    addressLine1: customer.addressLine1,
    addressLine2: customer.addressLine2,
    buildingNo: customer.buildingNo,
    city: customer.city,
    poBoxNo: customer.poBoxNo,
    company: customer.company,
    isDefault: false,
    isDisabled: false,
    syncStatus: 'pending',
  });

  return id;
};

/**
 * Get all customers with pending sync status.
 */
export const getPendingCustomers = async (db: ExpoSQLiteDatabase) => {
  return db.select().from(customers).where(eq(customers.syncStatus, 'pending'));
};

/**
 * Update the sync status of a customer.
 */
export const updateCustomerSyncStatus = async (
  db: ExpoSQLiteDatabase,
  customerId: string,
  status: 'pending' | 'synced' | 'failed',
): Promise<void> => {
  await db.update(customers).set({ syncStatus: status }).where(eq(customers.id, customerId));
};

/**
 * Update customer ID from temporary to API-returned ID.
 * Also sets syncStatus to 'synced'.
 */
export const updateCustomerIdAfterSync = async (
  db: ExpoSQLiteDatabase,
  tempId: string,
  apiId: string,
): Promise<void> => {
  await db
    .update(customers)
    .set({ id: apiId, syncStatus: 'synced' })
    .where(eq(customers.id, tempId));
};

/**
 * Check if a customer ID is a temporary ID.
 */
export const isTempCustomerId = (id: string): boolean => {
  return id.startsWith('TEMP_');
};

/**
 * Push all pending (offline-created) customers to the API.
 * For each pending customer:
 * - Calls the create customer API
 * - On success: replaces TEMP_ ID with API ID, sets syncStatus to 'synced'
 * - On failure: sets syncStatus to 'failed'
 */
export const pushPendingCustomers = async (db: ExpoSQLiteDatabase): Promise<void> => {
  const pending = await getPendingCustomers(db);

  if (pending.length === 0) {
    if (__DEV__) {
      console.log('[CustomersRepository] No pending customers to push');
    }
    return;
  }

  if (__DEV__) {
    console.log(`[CustomersRepository] Pushing ${pending.length} pending customer(s) to API...`);
  }

  for (const customer of pending) {
    try {
      const apiResponse = await createCustomerApi({
        customer_name: customer.name ?? '',
        mobile_no: customer.phoneNo ?? '',
        vat_number: customer.vatNumber ?? '',
        address_line1: customer.addressLine1 ?? '',
        address_line2: customer.addressLine2 ?? '',
        building_number: customer.buildingNo ?? '',
        city: customer.city ?? '',
        pb_no: customer.poBoxNo ?? '',
        company: customer.company ?? '',
      });

      if (apiResponse.data?.id) {
        await updateCustomerIdAfterSync(db, customer.id, apiResponse.data.id);
        if (__DEV__) {
          console.log(
            `[CustomersRepository] Pushed customer ${customer.id} → ${apiResponse.data.id}`,
          );
        }
      } else {
        // API succeeded but no ID returned — mark as synced
        await updateCustomerSyncStatus(db, customer.id, 'synced');
        if (__DEV__) {
          console.log(`[CustomersRepository] Pushed customer ${customer.id} (no API ID returned)`);
        }
      }
    } catch (error) {
      await updateCustomerSyncStatus(db, customer.id, 'failed');
      console.error(`[CustomersRepository] Failed to push customer ${customer.id}:`, error);
    }
  }
};
