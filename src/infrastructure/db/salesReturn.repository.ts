import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { and, eq, sql } from 'drizzle-orm';
import { invoiceItems, invoices, salesReturnItems, salesReturns } from './schema';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Represents an invoice item after SplitByPromotion.
 * If the original item had a promotion and qty >= minQty, it's split into:
 *   - A discounted row (qty = min(originalQty, maxQty), with discount fields)
 *   - A full-price row (qty = originalQty - discountedQty, no discount)
 * If no promotion or qty < minQty: single row at full price.
 */
export interface SplitInvoiceItem {
  itemCode: string;
  itemName: string;
  quantity: number; // available qty (positive) — the split row's qty
  rate: number; // original rate (before discount)
  taxRate: number;
  uom: string;
  discountType: string | null; // RATE | PERCENTAGE | AMOUNT | null
  discountValue: number;
  minQty: number;
  maxQty: number;
}

/**
 * An item selected for return, extending SplitInvoiceItem with the return quantity.
 */
export interface ReturnItem extends SplitInvoiceItem {
  returnQty: number; // how many to return (positive, <= quantity)
}

/**
 * The original invoice data loaded from the DB for the return flow.
 */
export interface OriginalInvoice {
  id: string; // local UUID
  invoiceNo: string | null; // local number (e.g. INV-2026-000042)
  invoiceId: string | null; // server-side ID (e.g. ACC-SINV-2026-00043)
  customerId: string | null;
  dateTime: Date;
}

export interface SaveSalesReturnParams {
  customerId: string | null;
  invoiceId: string | null; // original invoice's server-side ID (return_against)
  invoiceNumber: string; // this return's local number (with -RET suffix)
  pih: string;
  reason: string;
  shiftId: string | null;
  userId: string | null;
  posProfile: string | null;
  items: {
    itemCode: string;
    itemName: string;
    quantity: number; // should be NEGATIVE
    rate: number;
    taxRate: number;
    uom: string;
    discountType: string | null;
    discountValue: number;
    minQty: number;
    maxQty: number;
  }[];
}

// ─── Discount Utility ─────────────────────────────────────────────────────────

/**
 * Calculate the effective (discounted) unit rate for an item.
 *
 * - RATE:       discountValue IS the new rate (override price)
 * - PERCENTAGE: rate × (1 − discountValue/100)
 * - AMOUNT:     rate − discountValue
 * - else:       rate (no discount)
 */
export function getEffectiveRate(
  rate: number,
  discountType: string | null,
  discountValue: number,
): number {
  if (!discountType) return rate;

  switch (discountType) {
    case 'RATE':
      return discountValue;
    case 'PERCENTAGE':
      return rate * (1 - discountValue / 100);
    case 'AMOUNT':
      return rate - discountValue;
    default:
      return rate;
  }
}

// ─── SplitByPromotion ─────────────────────────────────────────────────────────

/**
 * Split invoice items by promotion eligibility.
 *
 * For each item:
 *  - If no discount or qty < minQty: single row at full price (no discount fields)
 *  - If eligible: discounted row (qty = min(qty, maxQty)) + remaining row (at full price)
 */
export function splitInvoiceItemsByPromotion(
  items: {
    itemCode: string | null;
    itemName: string | null;
    quantity: number | null;
    rate: number | null;
    taxPercentage: number | null;
    unitOfMeasure: string | null;
    discountType: string | null;
    discountValue: number | null;
    minQty: number | null;
    maxQty: number | null;
  }[],
): SplitInvoiceItem[] {
  const result: SplitInvoiceItem[] = [];

  for (const item of items) {
    const qty = item.quantity ?? 0;
    const rate = item.rate ?? 0;
    const taxRate = item.taxPercentage ?? 0;
    const uom = item.unitOfMeasure ?? 'Nos';
    const itemCode = item.itemCode ?? '';
    const itemName = item.itemName ?? '';
    const discountType = item.discountType;
    const discountValue = item.discountValue ?? 0;
    const minQty = item.minQty ?? 0;
    const maxQty = item.maxQty ?? 0;

    // Case 1: No discount or purchased quantity less than minimum required
    if (!discountType || qty < minQty) {
      result.push({
        itemCode,
        itemName,
        quantity: qty,
        rate,
        taxRate,
        uom,
        discountType: null,
        discountValue: 0,
        minQty: 0,
        maxQty: 0,
      });
      continue;
    }

    // Case 2: Eligible for discount
    const discountedQty = Math.min(qty, maxQty);
    const remainingQty = qty - discountedQty;

    // Discounted row
    result.push({
      itemCode,
      itemName,
      quantity: discountedQty,
      rate,
      taxRate,
      uom,
      discountType,
      discountValue,
      minQty,
      maxQty,
    });

    // Remaining row at full price (if any)
    if (remainingQty > 0) {
      result.push({
        itemCode,
        itemName,
        quantity: remainingQty,
        rate,
        taxRate,
        uom,
        discountType: null,
        discountValue: 0,
        minQty: 0,
        maxQty: 0,
      });
    }
  }

  return result;
}

// ─── Refund Calculation ───────────────────────────────────────────────────────

/**
 * Calculate the total refund amount using promotion clawback logic.
 *
 * For each return item:
 *   1. Check if promotion was applied at purchase (discountType && purchasedQty >= minQty)
 *   2. Calculate what the customer originally paid for the purchased qty
 *   3. Calculate net qty after return (purchasedQty - returnQty)
 *   4. Check if promotion is still valid at the new qty
 *   5. Calculate what the new charge should be:
 *      - If promo still valid: netQty × discountedRate
 *      - If promo invalidated: netQty × fullRate (clawback!)
 *   6. Refund = originalPaid - newCharge
 *
 * Returns the total refund amount (positive value).
 */
export function calculateRefundAmount(returnItems: ReturnItem[]): number {
  let totalRefund = 0;

  for (const item of returnItems) {
    if (item.returnQty <= 0) continue;

    const fullRate = item.rate;
    const purchasedQty = item.quantity; // the split row's original quantity

    // Step 1: Was promotion applied at purchase time?
    const wasPromoApplied = item.discountType !== null && purchasedQty >= item.minQty;

    // Step 2: Calculate the discounted rate
    const discountedRate = wasPromoApplied
      ? getEffectiveRate(fullRate, item.discountType, item.discountValue)
      : fullRate;

    // Step 3: What the customer originally paid for this row
    const originalTotalPaid = purchasedQty * discountedRate;

    // Step 4: Net quantity after return
    const netQty = purchasedQty - item.returnQty;

    // Step 5: Is promotion still valid after return?
    const isPromoStillValid = wasPromoApplied && netQty >= item.minQty;

    // Step 6: Calculate new charge
    const newCharge = isPromoStillValid ? netQty * discountedRate : netQty * fullRate; // clawback: remaining items at full price

    // Step 7: Refund = what was paid - what should be charged now
    const refund = originalTotalPaid - newCharge;
    totalRefund += Math.max(0, refund);
  }

  // Round to 2 decimal places
  return Math.round((totalRefund + Number.EPSILON) * 100) / 100;
}

// ─── Invoice Lookup ───────────────────────────────────────────────────────────

/**
 * Look up an invoice by its local invoice number.
 */
export async function getInvoiceByLocalNo(db: ExpoSQLiteDatabase, invoiceNo: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.invoiceNo, invoiceNo))
    .limit(1);

  if (!invoice) return null;

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceEntityId, invoice.id));

  return { invoice, items };
}

/**
 * Look up an invoice by its server-side ERP ID.
 */
export async function getInvoiceByServerId(db: ExpoSQLiteDatabase, serverId: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.invoiceId, serverId))
    .limit(1);

  if (!invoice) return null;

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceEntityId, invoice.id));

  return { invoice, items };
}

/**
 * Try to look up an invoice by either local number or server-side ID.
 * Tries local number first, then server-side ID.
 */
export async function lookupInvoice(
  db: ExpoSQLiteDatabase,
  searchTerm: string,
): Promise<{ invoice: OriginalInvoice; splitItems: SplitInvoiceItem[] } | null> {
  // Try local invoice number first
  let result = await getInvoiceByLocalNo(db, searchTerm.trim());

  // Fall back to server-side ID
  if (!result) {
    result = await getInvoiceByServerId(db, searchTerm.trim());
  }

  if (!result) return null;

  const { invoice, items } = result;

  const originalInvoice: OriginalInvoice = {
    id: invoice.id,
    invoiceNo: invoice.invoiceNo,
    invoiceId: invoice.invoiceId,
    customerId: invoice.customerId,
    dateTime: invoice.dateTime,
  };

  const splitItems = splitInvoiceItemsByPromotion(items);

  return { invoice: originalInvoice, splitItems };
}

// ─── Save Sales Return ────────────────────────────────────────────────────────

/**
 * Persist a sales return (credit note) to the local DB within a transaction.
 * Items should have NEGATIVE quantities.
 * Returns the generated UUID.
 */
export async function saveSalesReturn(
  db: ExpoSQLiteDatabase,
  params: SaveSalesReturnParams,
): Promise<string> {
  // Generate the UUID once so we can return it
  const { randomUUID } = await import('expo-crypto');
  const returnId = randomUUID();

  await db.transaction(async (tx) => {
    // 1. Insert SalesReturn header
    await tx.insert(salesReturns).values({
      id: returnId,
      invoiceNumber: params.invoiceNumber,
      invoiceId: params.invoiceId,
      customerId: params.customerId,
      pih: params.pih,
      reason: params.reason,
      createdOn: new Date(),
      isSynced: false,
      shiftId: params.shiftId,
      userId: params.userId,
      posProfile: params.posProfile,
      isError: false,
      isErrorSynced: false,
    });

    // 2. Insert SalesReturnItems (quantities should already be negative)
    for (const item of params.items) {
      await tx.insert(salesReturnItems).values({
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity: item.quantity,
        rate: item.rate,
        taxRate: item.taxRate,
        uom: item.uom,
        discountType: item.discountType,
        discountValue: item.discountValue,
        minQty: item.minQty,
        maxQty: item.maxQty,
        salesReturnId: returnId,
      });
    }
  });

  return returnId;
}

// ─── Sync Helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch a sales return with its items for sync purposes.
 */
export async function getSalesReturnForSync(db: ExpoSQLiteDatabase, returnId: string) {
  const [salesReturn] = await db
    .select()
    .from(salesReturns)
    .where(eq(salesReturns.id, returnId))
    .limit(1);

  if (!salesReturn) return null;

  const items = await db
    .select()
    .from(salesReturnItems)
    .where(eq(salesReturnItems.salesReturnId, returnId));

  return { salesReturn, items };
}

/**
 * Get all sales returns that haven't been synced yet and are not errored.
 */
export async function getUnsyncedSalesReturns(db: ExpoSQLiteDatabase) {
  return db
    .select()
    .from(salesReturns)
    .where(and(eq(salesReturns.isSynced, false), eq(salesReturns.isError, false)));
}

/**
 * Mark a sales return as synced and store the server-generated return ID.
 */
export async function markSalesReturnSynced(
  db: ExpoSQLiteDatabase,
  returnId: string,
  serverReturnId: string,
): Promise<void> {
  await db
    .update(salesReturns)
    .set({
      isSynced: true,
      salesReturnId: serverReturnId,
      syncedOn: new Date(),
    })
    .where(eq(salesReturns.id, returnId));
}

/**
 * Mark a sales return as having a sync error and store the error details.
 */
export async function markSalesReturnSyncError(
  db: ExpoSQLiteDatabase,
  returnId: string,
  error: unknown,
): Promise<void> {
  let errorMessage: string;
  try {
    if (error && typeof error === 'object' && 'response' in error) {
      errorMessage = JSON.stringify((error as any).response?.data ?? (error as any).message);
    } else if (error instanceof Error) {
      errorMessage = JSON.stringify({ message: error.message });
    } else {
      errorMessage = JSON.stringify(error);
    }
  } catch {
    errorMessage = String(error);
  }

  await db
    .update(salesReturns)
    .set({
      isSynced: false,
      isError: true,
      errorMessage,
    })
    .where(eq(salesReturns.id, returnId));
}

/**
 * Update the QR and XML file paths on a sales return record.
 */
export async function updateSalesReturnFiles(
  db: ExpoSQLiteDatabase,
  returnId: string,
  qrPath: string,
  xmlPath: string,
): Promise<void> {
  await db.update(salesReturns).set({ qrPath, xmlPath }).where(eq(salesReturns.id, returnId));
}

// ─── Error Recovery ───────────────────────────────────────────────────────────

/**
 * Fetch all sales returns that had a sync error and haven't been
 * reported to the server yet (isError = true, isErrorSynced = false).
 */
export async function getErroredSalesReturns(db: ExpoSQLiteDatabase) {
  return db
    .select()
    .from(salesReturns)
    .where(and(eq(salesReturns.isError, true), eq(salesReturns.isErrorSynced, false)));
}

/**
 * Mark an errored sales return as reported to the server via the
 * create_invoice_unsynced endpoint.
 */
export async function markSalesReturnErrorSynced(
  db: ExpoSQLiteDatabase,
  returnId: string,
): Promise<void> {
  await db
    .update(salesReturns)
    .set({
      isErrorSynced: true,
      errorSyncTime: new Date(),
    })
    .where(eq(salesReturns.id, returnId));
}

// ─── Shift Integration ───────────────────────────────────────────────────────

/**
 * Calculate the total sales return amount for a given shift.
 * Each return item's refund is: abs(quantity) × effectiveRate.
 */
export async function getSalesReturnTotalForShift(
  db: ExpoSQLiteDatabase,
  shiftLocalId: string,
): Promise<number> {
  // Get all sales return IDs for this shift
  const returns = await db
    .select({ id: salesReturns.id })
    .from(salesReturns)
    .where(eq(salesReturns.shiftId, shiftLocalId));

  if (returns.length === 0) return 0;

  let total = 0;

  for (const ret of returns) {
    const items = await db
      .select()
      .from(salesReturnItems)
      .where(eq(salesReturnItems.salesReturnId, ret.id));

    for (const item of items) {
      const absQty = Math.abs(item.quantity ?? 0);
      const effectiveRate = getEffectiveRate(
        item.rate ?? 0,
        item.discountType,
        item.discountValue ?? 0,
      );
      total += absQty * effectiveRate;
    }
  }

  return Math.round((total + Number.EPSILON) * 100) / 100;
}

/**
 * Count the number of sales returns for a given shift.
 */
export async function getSalesReturnCountForShift(
  db: ExpoSQLiteDatabase,
  shiftLocalId: string,
): Promise<number> {
  const rows = await db
    .select({
      count: sql<number>`COUNT(*)`,
    })
    .from(salesReturns)
    .where(eq(salesReturns.shiftId, shiftLocalId));

  return Number(rows[0]?.count) || 0;
}

// ─── Background Sync ─────────────────────────────────────────────────────────

/**
 * Push all pending (unsynced, non-errored) sales returns to the server.
 * Mirrors the pushPendingInvoices pattern.
 *
 * Returns the count of successfully synced sales returns.
 */
export async function pushPendingSalesReturns(
  db: ExpoSQLiteDatabase,
  params: {
    posProfile: string;
    shiftOpeningId: string;
    machineName: string;
  },
): Promise<number> {
  // Lazy import to avoid circular dependencies
  const { syncSalesReturnToServer, formatDateTimeForApi } =
    await import('@/src/features/sales-return/services/salesReturnApi.service');

  const pending = await getUnsyncedSalesReturns(db);

  if (pending.length === 0) {
    if (__DEV__) {
      console.log('[SalesReturnRepository] No pending sales returns to push');
    }
    return 0;
  }

  if (__DEV__) {
    console.log(
      `[SalesReturnRepository] Pushing ${pending.length} pending sales return(s) to API...`,
    );
  }

  let syncedCount = 0;

  for (const ret of pending) {
    try {
      const returnData = await getSalesReturnForSync(db, ret.id);
      if (!returnData) continue;

      // Build items JSON array: use discounted rate for the API
      const itemsJson = JSON.stringify(
        returnData.items.map((item) => ({
          item_code: item.itemCode || '',
          quantity: item.quantity || 0, // negative
          rate: getEffectiveRate(item.rate ?? 0, item.discountType, item.discountValue ?? 0),
          uom: item.uom || 'Nos',
          tax_rate: item.taxRate || 0,
        })),
      );

      // Calculate total refund amount for the payment
      const totalRefund = returnData.items.reduce((sum, item) => {
        const absQty = Math.abs(item.quantity ?? 0);
        const effectiveRate = getEffectiveRate(
          item.rate ?? 0,
          item.discountType,
          item.discountValue ?? 0,
        );
        return sum + absQty * effectiveRate;
      }, 0);

      // Build payments JSON array: single Cash entry with negative amount
      const paymentsJson = JSON.stringify([
        {
          payment_mode: 'Cash',
          amount: `-${totalRefund.toFixed(2)}`,
        },
      ]);

      // Get ZATCA file paths if available
      let qrPngPath = ret.qrPath || '';
      let xmlPath = ret.xmlPath || '';

      // Verify files exist if paths are set
      if (qrPngPath || xmlPath) {
        try {
          const FileSystem = await import('expo-file-system/legacy');
          if (qrPngPath) {
            const qrInfo = await FileSystem.getInfoAsync(qrPngPath);
            if (!qrInfo.exists) qrPngPath = '';
          }
          if (xmlPath) {
            const xmlInfo = await FileSystem.getInfoAsync(xmlPath);
            if (!xmlInfo.exists) xmlPath = '';
          }
        } catch {
          // Files may not exist
        }
      }

      const serverId = await syncSalesReturnToServer({
        customerName: returnData.salesReturn.customerId || 'Walk In',
        pih: returnData.salesReturn.pih || '',
        uniqueId: ret.id,
        machineName: params.machineName,
        offlineInvoiceNumber: returnData.salesReturn.invoiceNumber || '',
        posProfile: params.posProfile,
        returnAgainst: returnData.salesReturn.invoiceId || '',
        reason: returnData.salesReturn.reason || '',
        posShift: params.shiftOpeningId,
        offlineCreationTime: formatDateTimeForApi(returnData.salesReturn.createdOn),
        items: itemsJson,
        payments: paymentsJson,
        qrPngUri: qrPngPath,
        xmlUri: xmlPath,
      });

      await markSalesReturnSynced(db, ret.id, serverId);
      syncedCount++;

      if (__DEV__) {
        console.log(
          `[SalesReturnRepository] Pushed sales return ${ret.invoiceNumber} → server ID: ${serverId}`,
        );
      }
    } catch (error: any) {
      const isNetworkError =
        error && typeof error === 'object' && error.message === 'Network Error' && !error.response;

      if (isNetworkError) {
        if (__DEV__) {
          console.log(
            `[SalesReturnRepository] Network error pushing sales return ${ret.invoiceNumber}, will retry later`,
          );
        }
      } else {
        console.error(
          `[SalesReturnRepository] API error pushing sales return ${ret.invoiceNumber}:`,
          error,
        );
        try {
          await markSalesReturnSyncError(db, ret.id, error);
        } catch (dbErr) {
          console.error('[SalesReturnRepository] Failed to save sync error:', dbErr);
        }
      }
    }
  }

  return syncedCount;
}

/**
 * Push all errored sales returns to the server via the uncleared endpoint.
 * Mirrors the pushErroredInvoices pattern but with type = "Sales Return".
 *
 * Returns the count of successfully synced errored sales returns.
 */
export async function pushErroredSalesReturns(
  db: ExpoSQLiteDatabase,
  params: {
    posProfile: string;
    shiftOpeningId: string;
    machineName: string;
    userId: string;
  },
): Promise<number> {
  const { syncUnclearedSalesReturnToServer, formatDateTimeForApi } =
    await import('@/src/features/sales-return/services/salesReturnApi.service');

  const errored = await getErroredSalesReturns(db);

  if (errored.length === 0) {
    if (__DEV__) {
      console.log('[SalesReturnRepository] No errored sales returns to push');
    }
    return 0;
  }

  if (__DEV__) {
    console.log(
      `[SalesReturnRepository] Pushing ${errored.length} errored sales return(s) to uncleared endpoint...`,
    );
  }

  let syncedCount = 0;

  for (const ret of errored) {
    try {
      const returnData = await getSalesReturnForSync(db, ret.id);
      if (!returnData) continue;

      const itemsJson = JSON.stringify(
        returnData.items.map((item) => ({
          item_code: item.itemCode || '',
          quantity: item.quantity || 0,
          rate: getEffectiveRate(item.rate ?? 0, item.discountType, item.discountValue ?? 0),
          uom: item.uom || 'Nos',
          tax_rate: item.taxRate || 0,
        })),
      );

      const totalRefund = returnData.items.reduce((sum, item) => {
        const absQty = Math.abs(item.quantity ?? 0);
        const effectiveRate = getEffectiveRate(
          item.rate ?? 0,
          item.discountType,
          item.discountValue ?? 0,
        );
        return sum + absQty * effectiveRate;
      }, 0);

      const paymentsJson = JSON.stringify([
        {
          payment_mode: 'Cash',
          amount: `-${totalRefund.toFixed(2)}`,
        },
      ]);

      const jsonDump = JSON.stringify({
        machine_name: params.machineName,
        custom_offline_creation_time: formatDateTimeForApi(returnData.salesReturn.createdOn),
        pos_shift: params.shiftOpeningId,
        pos_profile: params.posProfile,
        cashier: params.userId,
        customer_name: returnData.salesReturn.customerId || 'Walk In',
        unique_id: ret.id,
        return_against: returnData.salesReturn.invoiceId || '',
        reason: returnData.salesReturn.reason || '',
        offline_invoice_number: returnData.salesReturn.invoiceNumber || '',
        PIH: returnData.salesReturn.pih || '',
        payments: paymentsJson,
        items: itemsJson,
      });

      await syncUnclearedSalesReturnToServer({
        dateTime: formatDateTimeForApi(returnData.salesReturn.createdOn),
        invoiceNumber: returnData.salesReturn.invoiceNumber || '',
        jsonDump,
        apiResponse: returnData.salesReturn.errorMessage || '',
      });

      await markSalesReturnErrorSynced(db, ret.id);
      syncedCount++;

      if (__DEV__) {
        console.log(
          `[SalesReturnRepository] Pushed errored sales return ${ret.invoiceNumber} to uncleared endpoint`,
        );
      }
    } catch (error) {
      console.error(
        `[SalesReturnRepository] Failed to push errored sales return ${ret.invoiceNumber}:`,
        error,
      );
    }
  }

  return syncedCount;
}
