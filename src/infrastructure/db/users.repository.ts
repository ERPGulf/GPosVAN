import { getTableColumns, sql, SQL } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { users } from './schema';

// API response structure from getOfflinePOSUsers (matches actual API response)
export interface UserApiResponse {
  name: string; // This becomes 'id' in our schema
  offine_username: string | null; // Note: API has typo 'offine_username', this becomes 'username'
  password: string | null;
  actual_user_name: string | null; // This becomes 'email' (it's the email in the system)
  branch_address: string | null; // This becomes 'address'
  shop_name: string | null;
  print_template: string | null; // This becomes 'invoiceTemplate'
  custom_print_format: string | null;
  custom_is_admin: boolean;
  pos_profiles: string[];
  custom_cashier_name: string | null;
}

// Local database user structure
export interface User {
  id: string;
  username?: string | null;
  password?: string | null;
  email?: string | null;
  address?: string | null;
  shopName?: string | null;
  invoiceTemplate?: string | null;
  isAdmin?: boolean;
  posProfile?: string[];
  cashierName?: string | null;
}

/**
 * Map API response to local database structure
 */
const mapApiUserToDbUser = (apiUser: UserApiResponse): User => ({
  id: apiUser.name, // 'name' from API becomes 'id'
  username: apiUser.offine_username, // 'offine_username' (with typo) becomes 'username'
  password: apiUser.password,
  email: apiUser.actual_user_name, // 'actual_user_name' becomes 'email'
  address: apiUser.branch_address, // 'branch_address' becomes 'address'
  shopName: apiUser.shop_name,
  invoiceTemplate: apiUser.print_template, // 'print_template' becomes 'invoiceTemplate'
  isAdmin: apiUser.custom_is_admin,
  posProfile: apiUser.pos_profiles, // 'pos_profiles' becomes 'posProfile'
  cashierName: apiUser.custom_cashier_name,
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
 * Sync users from API response to the SQLite database.
 * Uses upsert (INSERT ... ON CONFLICT DO UPDATE) for efficient single-query operation.
 */
export const syncUsers = async (
  db: ExpoSQLiteDatabase,
  apiUsers: UserApiResponse[],
): Promise<void> => {
  if (!apiUsers || apiUsers.length === 0) {
    return;
  }

  const mappedUsers = apiUsers.map(mapApiUserToDbUser);

  // Upsert all users in a single query using onConflictDoUpdate
  await db
    .insert(users)
    .values(mappedUsers)
    .onConflictDoUpdate({
      target: users.id,
      set: buildConflictUpdateColumns(users, [
        'username',
        'password',
        'email',
        'address',
        'shopName',
        'invoiceTemplate',
        'isAdmin',
        'posProfile',
        'cashierName',
      ]),
    });
};

/**
 * Get all users from the local database.
 */
export const getUsersFromDb = async (db: ExpoSQLiteDatabase): Promise<User[]> => {
  const result = await db.select().from(users);
  return result as User[];
};

/**
 * Clear all users from the local database.
 */
export const clearUsers = async (db: ExpoSQLiteDatabase): Promise<void> => {
  await db.delete(users);
};

/**
 * Authenticate a user by username and password.
 * Password should be provided in plain text and will be compared against stored base64 encoded password.
 */
export const authenticateUser = async <T extends Record<string, unknown>>(
  db: ExpoSQLiteDatabase<T>,
  username: string,
  password: string,
): Promise<{ success: boolean; user?: User; error?: string }> => {
  try {
    // Query directly by username using SQL lower() for case-insensitive comparison
    const result = await db
      .select()
      .from(users)
      .where(sql`lower(${users.username}) = ${username.toLowerCase()}`);

    const user = result[0];

    if (!user) {
      return { success: false, error: 'User not found' };
    }

    // Encode the input password to base64 for comparison
    const encodedPassword = btoa(password);

    if (user.password !== encodedPassword) {
      return { success: false, error: 'Invalid password' };
    }

    return { success: true, user: user as User };
  } catch (error) {
    return { success: false, error: 'Authentication failed' };
  }
};
