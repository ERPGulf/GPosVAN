import { eq } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import {
  buildBalanceDetails,
  formatDateForApi,
  syncOpenShiftToServer,
} from '../../features/shifts/services/shiftApi.service';
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
    branch?: string;
  },
): Promise<string> => {
  const shiftLocalId = generateShiftLocalId(params.username);

  await db.insert(shifts).values({
    shiftLocalId,
    userId: params.userId,
    openingCash: params.openingCash,
    shiftStartDate: new Date(),
    branch: params.branch,
  });

  return shiftLocalId;
};

// ============ Shift Sync Functions ============

/**
 * Get all shifts where opening has not been synced.
 */
export const getUnsyncedOpenShifts = async (db: ExpoSQLiteDatabase) => {
  return db
    .select()
    .from(shifts)
    .where(eq(shifts.isOpeningSynced, false));
};

/**
 * Mark a shift's opening as synced and store the server sync_id.
 */
export const markShiftOpeningSynced = async (
  db: ExpoSQLiteDatabase,
  shiftLocalId: string,
  shiftOpeningId: string,
): Promise<void> => {
  await db
    .update(shifts)
    .set({
      isOpeningSynced: true,
      shiftOpeningId,
    })
    .where(eq(shifts.shiftLocalId, shiftLocalId));
};

/**
 * Push all pending (unsynced) open shifts to the server API.
 * For each unsynced shift:
 * - Calls the opening_shift API
 * - On success: marks isOpeningSynced=true, stores shiftOpeningId
 * - On failure: logs the error, shift stays unsynced for next retry
 *
 * Returns an array of { shiftLocalId, shiftOpeningId } for successfully synced shifts.
 */
export const pushPendingOpenShifts = async (
  db: ExpoSQLiteDatabase,
  params: {
    userEmail: string;
    company: string;
    posProfile: string;
  },
): Promise<{ shiftLocalId: string; shiftOpeningId: string }[]> => {
  const pending = await getUnsyncedOpenShifts(db);

  if (pending.length === 0) {
    if (__DEV__) {
      console.log('[ShiftsRepository] No pending open shifts to push');
    }
    return [];
  }

  if (__DEV__) {
    console.log(`[ShiftsRepository] Pushing ${pending.length} pending open shift(s) to API...`);
  }

  const synced: { shiftLocalId: string; shiftOpeningId: string }[] = [];

  for (const shift of pending) {
    try {
      const syncId = await syncOpenShiftToServer({
        name: shift.shiftLocalId ?? '',
        period_start_date: formatDateForApi(shift.shiftStartDate),
        company: params.company,
        user: params.userEmail,
        pos_profile: params.posProfile,
        balance_details: buildBalanceDetails(shift.openingCash ?? 0),
      });

      await markShiftOpeningSynced(db, shift.shiftLocalId ?? '', syncId);

      if (__DEV__) {
        console.log(
          `[ShiftsRepository] Pushed shift ${shift.shiftLocalId} → sync_id: ${syncId}`,
        );
      }

      synced.push({ shiftLocalId: shift.shiftLocalId ?? '', shiftOpeningId: syncId });
    } catch (error) {
      console.error(
        `[ShiftsRepository] Failed to push shift ${shift.shiftLocalId}:`,
        error,
      );
    }
  }

  return synced;
};

