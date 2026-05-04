/**
 * Sales Return API Service
 *
 * Handles syncing credit notes to the ERP via:
 * - POST gpos.gpos.pos.create_credit_note (primary sync)
 * - POST gpos.gpos.pos.create_invoice_unsynced (error recovery, type = "Sales Return")
 *
 * Full implementation in Phase 3.
 */
import { apiClient } from '@/src/services/api/httpClient';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SalesReturnSyncParams {
  customerName: string;
  pih: string; // Previous Invoice Hash
  uniqueId: string; // return UUID
  machineName: string;
  offlineInvoiceNumber: string; // local invoice number with -RET suffix
  posProfile: string;
  returnAgainst: string; // original invoice's server-side ID
  reason: string;
  posShift: string; // shift opening ID
  offlineCreationTime: string; // 'YYYY-MM-DD HH:mm:ss'
  items: string; // JSON string: [{item_code, quantity, rate, uom, tax_rate}]
  payments: string; // JSON string: [{payment_mode, amount}]
  qrPngUri: string; // local file URI of QR PNG
  xmlUri: string; // local file URI of signed XML
}

export interface SalesReturnSyncResponse {
  data: {
    id: string; // e.g. "ACC-SINV-2026-00143"
    customer_id: string;
    unique_id: string;
    customer_name: string;
    total_quantity: number;
    total: number;
    grand_total: number;
    discount_amount: number;
    return_against: string;
    is_return: number;
  };
}

export interface UnclearedSalesReturnParams {
  dateTime: string; // 'YYYY-MM-DD HH:mm:ss'
  invoiceNumber: string; // local invoice number
  jsonDump: string; // full serialized return data
  apiResponse: string; // original error message
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Format a Date to 'YYYY-MM-DD HH:mm:ss' for the API.
 */
export const formatDateTimeForApi = (date: Date): string => {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
};

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Sync a sales return (credit note) to the server via multipart/form-data.
 * Returns the server-generated return ID (e.g. "ACC-SINV-2026-00143").
 *
 * Handles 409 Conflict as success (idempotent — already exists on server).
 */
export const syncSalesReturnToServer = async (
  params: SalesReturnSyncParams,
): Promise<string> => {
  const formData = new FormData();

  formData.append('customer_name', params.customerName);
  formData.append('PIH', params.pih);
  formData.append('unique_id', params.uniqueId);
  formData.append('machine_name', params.machineName);
  formData.append('offline_invoice_number', params.offlineInvoiceNumber);
  formData.append('pos_profile', params.posProfile);
  formData.append('return_against', params.returnAgainst);
  formData.append('reason', params.reason);
  formData.append('pos_shift', params.posShift);
  formData.append('offline_creation_time', params.offlineCreationTime);
  formData.append('items', params.items);
  formData.append('payments', params.payments);

  // Attach QR PNG as file (if available)
  if (params.qrPngUri) {
    formData.append('qr_code', {
      uri: params.qrPngUri,
      name: `${params.uniqueId}.jpg`,
      type: 'image/jpeg',
    } as any);
  }

  // Attach XML as file (if available)
  if (params.xmlUri) {
    formData.append('xml', {
      uri: params.xmlUri,
      name: `${params.uniqueId}.xml`,
      type: 'application/xml',
    } as any);
  }

  if (__DEV__) {
    console.log('[SalesReturnApi] Syncing sales return to server:', {
      uniqueId: params.uniqueId,
      offlineInvoiceNumber: params.offlineInvoiceNumber,
      returnAgainst: params.returnAgainst,
    });
  }

  try {
    const response = await apiClient.post<SalesReturnSyncResponse>(
      '/gpos.gpos.pos.create_credit_note',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );

    const serverId = response.data.data.id;

    if (!serverId) {
      throw new Error('Invalid API response — missing data.id');
    }

    if (__DEV__) {
      console.log('[SalesReturnApi] Sales return synced successfully, server ID:', serverId);
    }

    return serverId;
  } catch (error: any) {
    // Handle 409 Conflict as success (already exists on server)
    if (error?.response?.status === 409) {
      if (__DEV__) {
        console.log('[SalesReturnApi] 409 Conflict — sales return already exists on server');
      }
      // Return the unique_id as the server ID since the record already exists
      return params.uniqueId;
    }

    if (__DEV__) {
      console.error(
        '[SalesReturnApi] Failed to sync sales return:',
        error?.response?.data || error.message,
      );
    }
    throw error;
  }
};

/**
 * Sync an errored sales return to the server via the uncleared endpoint.
 * Uses type = "Sales Return" to distinguish from regular invoices.
 */
export const syncUnclearedSalesReturnToServer = async (
  params: UnclearedSalesReturnParams,
): Promise<void> => {
  const formData = new URLSearchParams();
  formData.append('date_time', params.dateTime);
  formData.append('invoice_number', params.invoiceNumber);
  formData.append('clearing_status', '0');
  formData.append('json_dump', params.jsonDump);
  formData.append('manually_submitted', '0');
  formData.append('api_response', params.apiResponse);
  formData.append('type', 'Sales Return');

  if (__DEV__) {
    console.log('[SalesReturnApi] Syncing uncleared sales return to server:', {
      invoiceNumber: params.invoiceNumber,
      dateTime: params.dateTime,
    });
  }

  try {
    await apiClient.post(
      '/gpos.gpos.pos.create_invoice_unsynced',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (__DEV__) {
      console.log(
        '[SalesReturnApi] Uncleared sales return synced successfully:',
        params.invoiceNumber,
      );
    }
  } catch (error: any) {
    if (__DEV__) {
      console.error(
        '[SalesReturnApi] Failed to sync uncleared sales return:',
        error?.response?.data || error.message,
      );
    }
    throw error;
  }
};
