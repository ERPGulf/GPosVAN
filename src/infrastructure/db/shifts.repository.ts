import { and, eq, sql } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import {
  buildBalanceDetails,
  buildPaymentReconciliation,
  buildShiftDetails,
  formatDateForApi,
  syncCloseShiftToServer,
  syncOpenShiftToServer,
} from '../../features/shifts/services/shiftApi.service';
import type { ShiftInvoiceDetails } from '../../features/shifts/services/shiftApi.service';
import { invoicePayments, invoices, shifts } from './schema';

/**
 * Generate a shift local ID in the format: username-yyyyMMdd-MachineId
 */
export const generateShiftLocalId = (username: string): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const dateTimeStr = `${year}${month}${day}${hours}${minutes}${seconds}`;

  const machineId = process.env.EXPO_PUBLIC_MACHINE_NAME || 'UNKNOWN';

  return `${username}-${dateTimeStr}-${machineId}`;
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

/**
 * Get a shift row by its local ID.
 */
export const getShiftByLocalId = async (
  db: ExpoSQLiteDatabase,
  shiftLocalId: string,
) => {
  const rows = await db
    .select()
    .from(shifts)
    .where(eq(shifts.shiftLocalId, shiftLocalId))
    .limit(1);
  return rows[0] ?? null;
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

/**
 * Close a shift:
 * 1. Calculate expected cash/card from invoice payments for this shift.
 * 2. Update the shift row with closing amounts, expected amounts, date, and mark closed.
 */
export const closeShift = async (
  db: ExpoSQLiteDatabase,
  params: {
    shiftLocalId: string;
    closingCash: number;
    closingCard: number;
    closingDate?: Date;
  },
): Promise<void> => {
  // Sum up all invoice-payment amounts for this shift, grouped by mode of payment.
  // invoices.shiftId stores the shiftLocalId.
  const rows = await db
    .select({
      mode: invoicePayments.modeOfPayment,
      total: sql<number>`COALESCE(SUM(${invoicePayments.amount}), 0)`,
    })
    .from(invoicePayments)
    .innerJoin(invoices, eq(invoicePayments.invoiceEntityId, invoices.id))
    .where(eq(invoices.shiftId, params.shiftLocalId))
    .groupBy(invoicePayments.modeOfPayment);

  let expectedCash = 0;
  let expectedCard = 0;

  for (const row of rows) {
    if (row.mode === 'Cash') {
      expectedCash = Number(row.total) || 0;
    } else if (row.mode === 'Card') {
      expectedCard = Number(row.total) || 0;
    }
  }

  if (__DEV__) {
    console.log('[ShiftsRepository] Closing shift:', {
      shiftLocalId: params.shiftLocalId,
      closingCash: params.closingCash,
      closingCard: params.closingCard,
      expectedCash,
      expectedCard,
    });
  }

  await db
    .update(shifts)
    .set({
      closingCash: params.closingCash,
      closingCard: params.closingCard,
      closingExpectedCash: expectedCash,
      closingExpectedCard: expectedCard,
      closingShiftDate: params.closingDate ?? new Date(),
      isShiftClosed: true,
    })
    .where(eq(shifts.shiftLocalId, params.shiftLocalId));
};

// ============ Closing Shift Sync Functions ============

/**
 * Compute invoice details for a shift (counts and totals).
 * Return-related fields are hardcoded to 0 since returns aren't implemented.
 */
export const getShiftInvoiceDetails = async (
  db: ExpoSQLiteDatabase,
  shiftLocalId: string,
): Promise<ShiftInvoiceDetails> => {
  // Count of invoices for this shift
  const countRows = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(invoices)
    .where(eq(invoices.shiftId, shiftLocalId));

  const numberOfInvoices = Number(countRows[0]?.count) || 0;

  // Sum payment amounts grouped by mode
  const paymentRows = await db
    .select({
      mode: invoicePayments.modeOfPayment,
      total: sql<number>`COALESCE(SUM(${invoicePayments.amount}), 0)`,
    })
    .from(invoicePayments)
    .innerJoin(invoices, eq(invoicePayments.invoiceEntityId, invoices.id))
    .where(eq(invoices.shiftId, shiftLocalId))
    .groupBy(invoicePayments.modeOfPayment);

  let totalCash = 0;
  let totalCard = 0;

  for (const row of paymentRows) {
    if (row.mode === 'Cash') {
      totalCash = Number(row.total) || 0;
    } else if (row.mode === 'Card') {
      totalCard = Number(row.total) || 0;
    }
  }

  const totalOfInvoices = totalCash + totalCard;

  return {
    number_of_invoices: numberOfInvoices,
    number_of_return_invoices: 0,
    total_of_invoices: totalOfInvoices,
    total_of_returns: 0,
    total_of_cash: totalCash,
    total_of_return_cash: 0,
    total_of_bank: totalCard, // Card maps to "bank" in the API
    total_of_return_bank: 0,
  };
};

/**
 * Check if all invoices for a given shift have been synced to the server.
 * Returns 'synced' if all invoices have is_synced = true (or no invoices exist),
 * otherwise returns 'unsynced'.
 */
export const getShiftInvoiceSyncStatus = async (
  db: ExpoSQLiteDatabase,
  shiftLocalId: string,
): Promise<'synced' | 'unsynced'> => {
  const unsyncedRows = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.shiftId, shiftLocalId),
        eq(invoices.isSynced, false),
      ),
    );

  const unsyncedCount = Number(unsyncedRows[0]?.count) || 0;
  return unsyncedCount === 0 ? 'synced' : 'unsynced';
};

/**
 * Mark a shift's closing as synced.
 */
export const markShiftClosingSynced = async (
  db: ExpoSQLiteDatabase,
  shiftLocalId: string,
): Promise<void> => {
  await db
    .update(shifts)
    .set({ isClosingSynced: true })
    .where(eq(shifts.shiftLocalId, shiftLocalId));
};

/**
 * Get all shifts where closing has not been synced (closed but not synced).
 */
export const getUnsyncedCloseShifts = async (db: ExpoSQLiteDatabase) => {
  return db
    .select()
    .from(shifts)
    .where(
      and(
        eq(shifts.isShiftClosed, true),
        eq(shifts.isClosingSynced, false),
      ),
    );
};

/**
 * Push all pending (unsynced) closed shifts to the server API.
 * For each unsynced closed shift:
 * - Requires a valid shiftOpeningId (server sync_id) — skips if missing
 * - Calls the closing_shift API
 * - On success: marks isClosingSynced=true
 * - On failure: logs the error, shift stays unsynced for next retry
 */
export const pushPendingCloseShifts = async (
  db: ExpoSQLiteDatabase,
  params: {
    company: string;
  },
): Promise<string[]> => {
  const pending = await getUnsyncedCloseShifts(db);

  if (pending.length === 0) {
    if (__DEV__) {
      console.log('[ShiftsRepository] No pending close shifts to push');
    }
    return [];
  }

  if (__DEV__) {
    console.log(`[ShiftsRepository] Pushing ${pending.length} pending close shift(s) to API...`);
  }

  const synced: string[] = [];

  for (const shift of pending) {
    // Skip if opening hasn't been synced yet (no server ID)
    if (!shift.shiftOpeningId) {
      if (__DEV__) {
        console.log(
          `[ShiftsRepository] Skipping close sync for ${shift.shiftLocalId} — no shiftOpeningId`,
        );
      }
      continue;
    }

    try {
      const details = await getShiftInvoiceDetails(db, shift.shiftLocalId ?? '');
      const invoiceSyncStatus = await getShiftInvoiceSyncStatus(db, shift.shiftLocalId ?? '');

      const endDate = shift.closingShiftDate
        ? formatDateForApi(shift.closingShiftDate)
        : formatDateForApi(new Date());

      await syncCloseShiftToServer({
        pos_opening_entry: shift.shiftOpeningId,
        company: params.company,
        period_end_date: endDate,
        payment_reconciliation: buildPaymentReconciliation({
          openingCash: shift.openingCash ?? 0,
          expectedCash: shift.closingExpectedCash ?? 0,
          closingCash: shift.closingCash ?? 0,
          expectedCard: shift.closingExpectedCard ?? 0,
          closingCard: shift.closingCard ?? 0,
        }),
        details: buildShiftDetails(details),
        name: shift.shiftOpeningId,
        created_invoice_status: invoiceSyncStatus,
      });

      await markShiftClosingSynced(db, shift.shiftLocalId ?? '');

      if (__DEV__) {
        console.log(
          `[ShiftsRepository] Pushed close shift ${shift.shiftLocalId} successfully`,
        );
      }

      synced.push(shift.shiftLocalId ?? '');
    } catch (error) {
      console.error(
        `[ShiftsRepository] Failed to push close shift ${shift.shiftLocalId}:`,
        error,
      );
    }
  }

  return synced;
};

