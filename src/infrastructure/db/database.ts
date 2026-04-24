import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';

/**
 * Shared singleton Drizzle database instance.
 * Used by Redux thunks and other non-component code that can't access
 * useSQLiteContext(). Uses the same database file as the SQLiteProvider.
 */
const expoDb = openDatabaseSync('van_pos.db', { enableChangeListener: true });
export const db = drizzle(expoDb);
