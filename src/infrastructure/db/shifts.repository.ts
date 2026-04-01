import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { shifts } from './schema';

/**
 * Generate a shift local ID in the format: username-yyyyMMdd-MachineId
 */
export const generateShiftLocalId = (username: string): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  const machineId = process.env.EXPO_PUBLIC_MACHINE_NAME || 'UNKNOWN';

  return `${username}-${dateStr}-${machineId}`;
};

/**
 * Open a new shift by inserting a record into the Shifts table.
 */
export const openShift = async (
  db: ExpoSQLiteDatabase,
  params: {
    userId: string;
    username: string;
    openingCash: number;
  },
): Promise<string> => {
  const shiftLocalId = generateShiftLocalId(params.username);

  await db.insert(shifts).values({
    shiftLocalId,
    userId: params.userId,
    openingCash: params.openingCash,
    shiftStartDate: new Date(),
  });

  return shiftLocalId;
};
