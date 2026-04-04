import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { and, eq, sql } from 'drizzle-orm';
import { invoiceIdSequence, invoiceItems, invoicePayments, invoices } from './schema';
import type { CartItem } from '@/src/features/cart/types';
import { getAppConfig } from '@/src/services/configStore';

// ─── Invoice number generator ────────────────────────────────────────────────

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Atomically increments the global invoice sequence counter and returns a
 * formatted invoice number: INV-YYYYMMDD-XXXXXX (e.g. INV-20260401-000042)
 */
export async function getNextInvoiceNo(db: ExpoSQLiteDatabase): Promise<string> {
  const appConfig = await getAppConfig();
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
  const dateStr = formatDate(new Date());
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

    // 2. Insert InvoiceItems — one row per cart item
    for (const item of params.cartItems) {
      await tx.insert(invoiceItems).values({
        itemCode: item.product.itemCode,
        itemName: item.product.name,
        quantity: item.quantity,
        rate: item.product.uomPrice ?? item.product.price ?? 0,
        taxPercentage: item.product.taxPercentage ?? 15,
        unitOfMeasure: item.product.uom,
        invoiceEntityId: params.invoiceUUID,
        discountType: null,
        minQty: 0,
        maxQty: 0,
        discountValue: 0,
      });
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
      isSynced: true,
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

