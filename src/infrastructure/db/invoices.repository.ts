import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { and, eq, sql } from 'drizzle-orm';
import { invoiceIdSequence, invoiceItems, invoicePayments, invoices } from './schema';
import type { CartItem } from '@/src/features/cart/types';
import { getMachineName } from '@/src/services/credentialStore';
import { logger } from '@/src/services/logger';
import { store } from '@/src/store/store';

// ─── Invoice number generator ────────────────────────────────────────────────

function formatYear(date: Date): string {
  return String(date.getFullYear());
}

/**
 * Atomically increments the global invoice sequence counter and returns a
 * formatted invoice number: INV-YYYY-XXXXXX (e.g. INV-2026-000042)
 */
export async function getNextInvoiceNo(db: ExpoSQLiteDatabase): Promise<string> {
  const appConfig = store.getState().appConfig.config;
  const prefix = appConfig?.prefix || 'INV';

  // Upsert: insert seed row if not present, otherwise increment and return
  await db
    .insert(invoiceIdSequence)
    .values({ id: 1, sequence: 1 })
    .onConflictDoUpdate({
      target: invoiceIdSequence.id,
      set: { sequence: sql`${invoiceIdSequence.sequence} + 1` },
    });

  const row = await db
    .select({ sequence: invoiceIdSequence.sequence })
    .from(invoiceIdSequence)
    .where(eq(invoiceIdSequence.id, 1))
    .limit(1);

  const seq = row[0]?.sequence ?? 1;
  const dateStr = formatYear(new Date());
  const paddedSeq = String(seq).padStart(6, '0');
  return `${prefix}-${dateStr}-${paddedSeq}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SaveInvoiceParams {
  invoiceUUID: string;
  invoiceNo: string;
  customerId: string | null;
  shiftId: string | null;
  userId: string | null;
  posProfile: string | null;
  previousInvoiceHash: string;
  discount: number;
  cartItems: CartItem[];
  paymentMethod: 'Cash' | 'Card' | 'Cash/Card';
  cashAmount: number;
  cardAmount: number;
  dateTime: Date;
}

// ─── Save invoice ─────────────────────────────────────────────────────────────

/**
 * Persists a completed invoice to the local SQLite database within a transaction.
 * Inserts into Invoice, InvoiceItems, and InvoicePayments tables.
 */
export async function saveInvoiceToDb(
  db: ExpoSQLiteDatabase,
  params: SaveInvoiceParams,
): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Insert into Invoice
    await tx.insert(invoices).values({
      id: params.invoiceUUID,
      invoiceNo: params.invoiceNo,
      customerId: params.customerId,
      customerPurchaseOrder: params.cartItems.length,
      discount: params.discount,
      previousInvoiceHash: params.previousInvoiceHash,
      isSynced: false,
      dateTime: params.dateTime,
      posProfile: params.posProfile,
      shiftId: params.shiftId,
      userId: params.userId,
      isError: false,
      isErrorSynced: false,
    });

    // 2. Insert InvoiceItems — SplitByPromotion
    //    If a cart item has a promotion and qty > maxQty:
    //      → Row 1: discounted portion (qty = maxQty, with discount fields)
    //      → Row 2: remaining portion (qty = total - maxQty, at full price)
    //    If qty <= maxQty: single row with discount fields.
    //    If no promotion: single row at full price.
    for (const item of params.cartItems) {
      const originalRate = item.product.uomPrice ?? item.product.price ?? 0;
      const taxPct = item.product.taxPercentage ?? 15;

      if (item.promotion) {
        const eligibleQty = Math.min(item.quantity, item.promotion.maxQty);
        const remainingQty = item.quantity - eligibleQty;

        // Determine the discountValue to store based on discount type
        let discountValue = 0;
        switch (item.promotion.discountType) {
          case 'RATE':
            discountValue = item.promotion.discountPrice;
            break;
          case 'PERCENTAGE':
            discountValue = item.promotion.discountPercentage;
            break;
          case 'AMOUNT':
            discountValue = item.promotion.discountPrice;
            break;
        }

        // Row 1: Discounted portion
        if (eligibleQty > 0) {
          await tx.insert(invoiceItems).values({
            itemCode: item.product.itemCode,
            itemName: item.product.name,
            quantity: eligibleQty,
            rate: originalRate,
            taxPercentage: taxPct,
            unitOfMeasure: item.product.uom,
            invoiceEntityId: params.invoiceUUID,
            discountType: item.promotion.discountType,
            minQty: item.promotion.minQty,
            maxQty: item.promotion.maxQty,
            discountValue,
          });
        }

        // Row 2: Remaining at full price (only if there's overflow)
        if (remainingQty > 0) {
          await tx.insert(invoiceItems).values({
            itemCode: item.product.itemCode,
            itemName: item.product.name,
            quantity: remainingQty,
            rate: originalRate,
            taxPercentage: taxPct,
            unitOfMeasure: item.product.uom,
            invoiceEntityId: params.invoiceUUID,
            discountType: null,
            minQty: 0,
            maxQty: 0,
            discountValue: 0,
          });
        }
      } else {
        // No promotion — single row at full price
        await tx.insert(invoiceItems).values({
          itemCode: item.product.itemCode,
          itemName: item.product.name,
          quantity: item.quantity,
          rate: originalRate,
          taxPercentage: taxPct,
          unitOfMeasure: item.product.uom,
          invoiceEntityId: params.invoiceUUID,
          discountType: null,
          minQty: 0,
          maxQty: 0,
          discountValue: 0,
        });
      }
    }

    // 3. Insert InvoicePayments — split rows as needed
    const now = params.dateTime;

    if (params.paymentMethod === 'Cash/Card') {
      if (params.cashAmount > 0) {
        await tx.insert(invoicePayments).values({
          modeOfPayment: 'Cash',
          amount: params.cashAmount,
          invoiceEntityId: params.invoiceUUID,
          userId: params.userId,
          createAt: now,
        });
      }
      if (params.cardAmount > 0) {
        await tx.insert(invoicePayments).values({
          modeOfPayment: 'Card',
          amount: params.cardAmount,
          invoiceEntityId: params.invoiceUUID,
          userId: params.userId,
          createAt: now,
        });
      }
    } else {
      const totalAmount = params.cartItems.reduce((sum, item) => {
        const rate = item.product.uomPrice ?? item.product.price ?? 0;
        return sum + rate * item.quantity;
      }, 0);

      await tx.insert(invoicePayments).values({
        modeOfPayment: params.paymentMethod,
        amount: totalAmount,
        invoiceEntityId: params.invoiceUUID,
        userId: params.userId,
        createAt: now,
      });
    }
  });
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch an invoice with its items and payments for sync purposes.
 */
export async function getInvoiceForSync(
  db: ExpoSQLiteDatabase,
  invoiceUUID: string,
) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, invoiceUUID))
    .limit(1);

  if (!invoice) return null;

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceEntityId, invoiceUUID));

  const payments = await db
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceEntityId, invoiceUUID));

  return { invoice, items, payments };
}

/**
 * Mark an invoice as synced and store the server-generated invoice ID.
 */
export async function markInvoiceAsSynced(
  db: ExpoSQLiteDatabase,
  invoiceUUID: string,
  serverInvoiceId: string,
): Promise<void> {
  await db
    .update(invoices)
    .set({
      isSynced: true,
      invoiceId: serverInvoiceId,
      syncDateTime: new Date(),
    })
    .where(eq(invoices.id, invoiceUUID));
}

/**
 * Mark an invoice as having a sync error and store the error details.
 */
export async function markInvoiceSyncError(
  db: ExpoSQLiteDatabase,
  invoiceUUID: string,
  error: unknown,
): Promise<void> {
  let errorMessage: string;
  try {
    if (error && typeof error === 'object' && 'response' in error) {
      // Axios-style error — store the server response body
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
    .update(invoices)
    .set({
      isSynced: false,
      isError: true,
      errorMessage,
    })
    .where(eq(invoices.id, invoiceUUID));
}

// ─── Error invoice sync helpers ──────────────────────────────────────────────

/**
 * Fetch all invoices that had a sync error and haven't been
 * reported to the server yet (isError = true, isErrorSynced = false).
 */
export async function getErrorInvoices(db: ExpoSQLiteDatabase) {
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.isError, true),
        eq(invoices.isErrorSynced, false),
      ),
    );
}

/**
 * Mark an errored invoice as reported to the server via the
 * create_invoice_unsynced endpoint.
 */
export async function markInvoiceErrorSynced(
  db: ExpoSQLiteDatabase,
  invoiceUUID: string,
): Promise<void> {
  await db
    .update(invoices)
    .set({
      isErrorSynced: true,
      errorSyncTime: new Date(),
    })
    .where(eq(invoices.id, invoiceUUID));
}

/**
 * Fetch a single errored invoice with its items and payments,
 * ready for building the json_dump payload.
 */
export async function getErrorInvoiceForSync(
  db: ExpoSQLiteDatabase,
  invoiceUUID: string,
) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.id, invoiceUUID),
        eq(invoices.isError, true),
        eq(invoices.isErrorSynced, false),
      ),
    )
    .limit(1);

  if (!invoice) return null;

  const items = await db
    .select()
    .from(invoiceItems)
    .where(eq(invoiceItems.invoiceEntityId, invoiceUUID));

  const payments = await db
    .select()
    .from(invoicePayments)
    .where(eq(invoicePayments.invoiceEntityId, invoiceUUID));

  return { invoice, items, payments };
}

// ─── Background sync: push pending invoices ─────────────────────────────────

/**
 * Get all invoices that haven't been synced yet and are not errored.
 * These are invoices saved locally but the initial sync never happened
 * (e.g. device was offline, or shiftOpeningId was missing at checkout time).
 */
export async function getUnsyncedInvoices(db: ExpoSQLiteDatabase) {
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.isSynced, false),
        eq(invoices.isError, false),
      ),
    );
}

/**
 * Push all pending (unsynced, non-errored) invoices to the server.
 * For each invoice:
 * - Fetches invoice data with items & payments
 * - Calls the create_invoice API via syncInvoiceToServer
 * - On success: marks isSynced=true, stores server invoice ID
 * - On failure: marks as errored and attempts uncleared sync
 *
 * Returns the count of successfully synced invoices.
 */
export async function pushPendingInvoices(
  db: ExpoSQLiteDatabase,
  params: {
    posProfile: string;
    shiftOpeningId: string;
    phase: string;
    machineName: string;
  },
): Promise<number> {
  // Lazy imports to avoid circular dependencies
  const { syncInvoiceToServer, formatDateTimeForApi } = await import(
    '../../features/invoices/services/invoiceApi.service'
  );

  const pending = await getUnsyncedInvoices(db);

  if (pending.length === 0) {
    if (__DEV__) {
      console.log('[InvoicesRepository] No pending invoices to push');
    }
    return 0;
  }

  if (__DEV__) {
    console.log(`[InvoicesRepository] Pushing ${pending.length} pending invoice(s) to API...`);
  }

  let syncedCount = 0;

  for (const inv of pending) {
    try {
      const invoiceData = await getInvoiceForSync(db, inv.id);
      if (!invoiceData) continue;

      // Build items JSON array
      const itemsJson = JSON.stringify(
        invoiceData.items.map((item) => ({
          item_code: item.itemCode || '',
          quantity: item.quantity || 0,
          rate: item.rate || 0,
          uom: item.unitOfMeasure || 'Nos',
          tax_rate: item.taxPercentage || 0,
        })),
      );

      // Build payments JSON array
      const paymentsJson = JSON.stringify(
        invoiceData.payments.map((p) => ({
          mode_of_payment: p.modeOfPayment || 'Cash',
          amount: (p.amount || 0).toFixed(2),
        })),
      );

      // Try to get saved QR/XML file paths from zatca-invoices directory
      let qrPngPath = '';
      let xmlPath = '';
      try {
        const FileSystem = await import('expo-file-system/legacy');
        const baseDir = FileSystem.documentDirectory || '';
        const qrFile = `${baseDir}zatca-invoices/${inv.id}.png`;
        const xmlFile = `${baseDir}zatca-invoices/${inv.id}.xml`;
        const qrInfo = await FileSystem.getInfoAsync(qrFile);
        const xmlInfo = await FileSystem.getInfoAsync(xmlFile);
        if (qrInfo.exists) qrPngPath = qrFile;
        if (xmlInfo.exists) xmlPath = xmlFile;
      } catch {
        // Files may not exist, will be handled by the API
      }

      const serverId = await syncInvoiceToServer({
        customerName: invoiceData.invoice.customerId || 'Walk In',
        customerPurchaseOrder: invoiceData.invoice.customerPurchaseOrder || 0,
        items: itemsJson,
        qrPngUri: qrPngPath,
        xmlUri: xmlPath,
        uniqueId: inv.id,
        machineName: params.machineName,
        payments: paymentsJson,
        phase: params.phase,
        posProfile: params.posProfile,
        offlineInvoiceNumber: invoiceData.invoice.invoiceNo || '',
        customOfflineCreationTime: formatDateTimeForApi(invoiceData.invoice.dateTime),
        posShift: params.shiftOpeningId,
      });

      await markInvoiceAsSynced(db, inv.id, serverId);
      syncedCount++;

      if (__DEV__) {
        console.log(`[InvoicesRepository] Pushed invoice ${inv.invoiceNo} → server ID: ${serverId}`);
      }
    } catch (error: any) {
      // Detect if this is a network error (device offline) vs an actual API error
      const isNetworkError =
        error &&
        typeof error === 'object' &&
        error.message === 'Network Error' &&
        !error.response;

      if (isNetworkError) {
        // Network error — leave as isSynced=false, isError=false for next retry cycle
        if (__DEV__) {
          console.log(`[InvoicesRepository] Network error pushing invoice ${inv.invoiceNo}, will retry later`);
        }
      } else {
        console.error(`[InvoicesRepository] API error pushing invoice ${inv.invoiceNo}:`, error);
        logger.recordError(error, 'PushPendingInvoice');
        // Mark as errored so it can be retried via the uncleared endpoint
        try {
          await markInvoiceSyncError(db, inv.id, error);
        } catch (dbErr) {
          console.error('[InvoicesRepository] Failed to save sync error:', dbErr);
          logger.recordError(dbErr, 'PushPendingInvoice.saveError');
        }
      }
    }
  }

  return syncedCount;
}

/**
 * Push all errored invoices to the server via the uncleared endpoint.
 * For each errored invoice (isError=true, isErrorSynced=false):
 * - Builds the json_dump payload
 * - Calls the create_invoice_unsynced API
 * - On success: marks isErrorSynced=true
 * - On failure: logs the error, invoice stays for next retry
 *
 * Returns the count of successfully synced errored invoices.
 */
export async function pushErroredInvoices(
  db: ExpoSQLiteDatabase,
  params: {
    posProfile: string;
    shiftOpeningId: string;
    phase: string;
    machineName: string;
    userId: string;
  },
): Promise<number> {
  const {
    buildInvoiceJsonDump,
    formatDateTimeForApi,
    syncUnclearedInvoiceToServer,
  } = await import('../../features/invoices/services/invoiceApi.service');

  const errored = await getErrorInvoices(db);

  if (errored.length === 0) {
    if (__DEV__) {
      console.log('[InvoicesRepository] No errored invoices to push');
    }
    return 0;
  }

  if (__DEV__) {
    console.log(`[InvoicesRepository] Pushing ${errored.length} errored invoice(s) to uncleared endpoint...`);
  }

  let syncedCount = 0;

  for (const inv of errored) {
    try {
      const invoiceData = await getErrorInvoiceForSync(db, inv.id);
      if (!invoiceData) continue;

      const itemsJson = JSON.stringify(
        invoiceData.items.map((item) => ({
          item_code: item.itemCode || '',
          quantity: item.quantity || 0,
          rate: item.rate || 0,
          uom: item.unitOfMeasure || 'Nos',
          tax_rate: item.taxPercentage || 0,
        })),
      );

      const paymentsJson = JSON.stringify(
        invoiceData.payments.map((p) => ({
          mode_of_payment: p.modeOfPayment || 'Cash',
          amount: (p.amount || 0).toFixed(2),
        })),
      );

      const jsonDump = buildInvoiceJsonDump({
        machineName: params.machineName,
        customOfflineCreationTime: formatDateTimeForApi(invoiceData.invoice.dateTime),
        posShift: params.shiftOpeningId,
        discountAmount: (invoiceData.invoice.discount || 0).toFixed(2),
        phase: params.phase,
        offlineInvoiceNumber: invoiceData.invoice.invoiceNo || '',
        posProfile: params.posProfile,
        cashier: params.userId,
        customerName: invoiceData.invoice.customerId || 'Walk In',
        uniqueId: inv.id,
        customerPurchaseOrder: String(invoiceData.invoice.customerPurchaseOrder || 0),
        pih: invoiceData.invoice.previousInvoiceHash || '',
        payments: paymentsJson,
        items: itemsJson,
      });

      await syncUnclearedInvoiceToServer({
        dateTime: formatDateTimeForApi(invoiceData.invoice.dateTime),
        invoiceNumber: invoiceData.invoice.invoiceNo || '',
        jsonDump,
        apiResponse: invoiceData.invoice.errorMessage || '',
      });

      await markInvoiceErrorSynced(db, inv.id);
      syncedCount++;

      if (__DEV__) {
        console.log(`[InvoicesRepository] Pushed errored invoice ${inv.invoiceNo} to uncleared endpoint`);
      }
    } catch (error) {
      console.error(
        `[InvoicesRepository] Failed to push errored invoice ${inv.invoiceNo}:`,
        error,
      );
      logger.recordError(error, 'PushErroredInvoice');
    }
  }

  return syncedCount;
}

