import { getTableColumns, sql, SQL } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { offlineUsers } from './schema';

// API response structure from getOfflinePOSUsers
export interface OfflineUserApiResponse {
  name: string;
  offine_username: string | null; // Note: API has typo 'offine_username'
  shop_name: string | null;
  password: string | null;
  custom_cashier_name: string | null;
  actual_user_name: string | null;
  branch_address: string | null;
  print_template: string | null;
  custom_print_format: string | null;
  custom_is_admin: boolean;
  pos_profiles: string[];
}

// Local database user structure
export interface OfflineUser {
  name: string;
  offlineUsername?: string | null;
  shopName?: string | null;
  password?: string | null;
  customCashierName?: string | null;
  actualUserName?: string | null;
  branchAddress?: string | null;
  printTemplate?: string | null;
  customPrintFormat?: string | null;
  customIsAdmin?: boolean;
  posProfiles?: string[];
}

/**
 * Map API response to local database structure
 */
const mapApiUserToDbUser = (apiUser: OfflineUserApiResponse): OfflineUser => ({
  name: apiUser.name,
  offlineUsername: apiUser.offine_username,
  shopName: apiUser.shop_name,
  password: apiUser.password,
  customCashierName: apiUser.custom_cashier_name,
  actualUserName: apiUser.actual_user_name,
  branchAddress: apiUser.branch_address,
  printTemplate: apiUser.print_template,
  customPrintFormat: apiUser.custom_print_format,
  customIsAdmin: apiUser.custom_is_admin,
  posProfiles: apiUser.pos_profiles,
});

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
 * Sync offline users from API response to the SQLite database.
 * Uses upsert (INSERT ... ON CONFLICT DO UPDATE) for efficient single-query operation.
 */
export const syncOfflineUsers = async (
  db: ExpoSQLiteDatabase,
  apiUsers: OfflineUserApiResponse[],
): Promise<void> => {
  if (!apiUsers || apiUsers.length === 0) {
    return;
  }

  try {
    const users = apiUsers.map(mapApiUserToDbUser);
    // Upsert all users in a single query using onConflictDoUpdate
    await db
      .insert(offlineUsers)
      .values(users)
      .onConflictDoUpdate({
        target: offlineUsers.name,
        set: buildConflictUpdateColumns(offlineUsers, [
          'offlineUsername',
          'shopName',
          'password',
          'customCashierName',
          'actualUserName',
          'branchAddress',
          'printTemplate',
          'customPrintFormat',
          'customIsAdmin',
          'posProfiles',
        ]),
      });
  } catch (error) {
    console.error('Error syncing offline users:', error);
  }
};

/**
 * Get all offline users from the local database.
 */
export const getOfflineUsersFromDb = async (db: ExpoSQLiteDatabase): Promise<OfflineUser[]> => {
  const users = await db.select().from(offlineUsers);
  return users as OfflineUser[];
};

/**
 * Clear all offline users from the local database.
 */
export const clearOfflineUsers = async (db: ExpoSQLiteDatabase): Promise<void> => {
  await db.delete(offlineUsers);
};

/**
 * Authenticate a user by username and password.
 * Password should be provided in plain text and will be compared against stored base64 encoded password.
 */
export const authenticateUser = async <T extends Record<string, unknown>>(
  db: ExpoSQLiteDatabase<T>,
  username: string,
  password: string,
): Promise<{ success: boolean; user?: OfflineUser; error?: string }> => {
  try {
    // Query directly by username using SQL lower() for case-insensitive comparison
    const users = await db
      .select()
      .from(offlineUsers)
      .where(sql`lower(${offlineUsers.offlineUsername}) = ${username.toLowerCase()}`);

    const user = users[0];

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Encode the input password to base64 for comparison
    const encodedPassword = btoa(password);

    if (user.password !== encodedPassword) {
      return { success: false, error: 'Invalid password' };
    }

    return { success: true, user: user as OfflineUser };
  } catch (error) {
    return { success: false, error: 'Authentication failed' };
  }
};
