import { apiClient } from '@/src/services/api/httpClient';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface InvoiceSyncParams {
  customerName: string;
  customerPurchaseOrder: number;
  items: string; // JSON string: [{"item_code","quantity","rate","uom","tax_rate"}]
  qrPngUri: string; // local file URI of QR PNG
  xmlUri: string; // local file URI of signed XML
  uniqueId: string; // invoiceUUID
  machineName: string;
  payments: string; // JSON string: [{"mode_of_payment","amount"}]
  phase: string;
  posProfile: string;
  offlineInvoiceNumber: string; // invoiceNo
  customOfflineCreationTime: string; // 'YYYY-MM-DD HH:mm:ss'
  posShift: string; // shiftOpeningId (server sync_id)
}

export interface InvoiceSyncResponse {
  data: {
    id: string; // e.g. "ACC-SINV-2026-00043"
    customer_id: string;
    unique_id: string;
    customer_name: string;
    total_quantity: number;
    total: number;
    net_total: number;
    grand_total: number;
    'Customer\'s Purchase Order': number;
    discount_amount: number;
  };
}

// ─── API Function ────────────────────────────────────────────────────────────

/**
 * Sync a completed invoice to the server via multipart/form-data.
 * Returns the server-generated invoice ID (e.g. "ACC-SINV-2026-00043").
 */
export const syncInvoiceToServer = async (
  params: InvoiceSyncParams,
): Promise<string> => {
  const formData = new FormData();

  formData.append('customer_name', params.customerName);
  formData.append('Customer_Purchase_Order', String(params.customerPurchaseOrder));
  formData.append('items', params.items);
  formData.append('unique_id', params.uniqueId);
  formData.append('machine_name', params.machineName);
  formData.append('payments', params.payments);
  formData.append('phase', params.phase);
  formData.append('pos_profile', params.posProfile);
  formData.append('offline_invoice_number', params.offlineInvoiceNumber);
  formData.append('custom_offline_creation_time', params.customOfflineCreationTime);
  formData.append('pos_shift', params.posShift);

  // Attach QR PNG as file
  formData.append('qr_code', {
    uri: params.qrPngUri,
    name: `${params.uniqueId}.png`,
    type: 'image/png',
  } as any);

  // Attach XML as file
  formData.append('xml', {
    uri: params.xmlUri,
    name: `${params.uniqueId}.xml`,
    type: 'application/xml',
  } as any);

  if (__DEV__) {
    console.log('[InvoiceApi] Syncing invoice to server:', {
      uniqueId: params.uniqueId,
      offlineInvoiceNumber: params.offlineInvoiceNumber,
      posShift: params.posShift,
      customerName: params.customerName,
    });
  }

  try {
    const response = await apiClient.post<InvoiceSyncResponse>(
      '/gpos.gpos.pos.create_invoice',
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
      console.log('[InvoiceApi] Invoice synced successfully, server ID:', serverId);
    }

    return serverId;
  } catch (error: any) {
    if (__DEV__) {
      console.error(
        '[InvoiceApi] Failed to sync invoice:',
        error?.response?.data || error.message,
      );
    }
    throw error;
  }
};

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

// ─── Uncleared (Errored) Invoice Sync ────────────────────────────────────────

export interface UnclearedInvoiceSyncParams {
  dateTime: string;            // 'YYYY-MM-DD HH:mm:ss'
  invoiceNumber: string;       // local invoice number (invoiceNo)
  jsonDump: string;            // full serialized invoice JSON
  apiResponse: string;         // error message from the original failed sync
}

/**
 * Build the json_dump string for the uncleared invoice sync API.
 * This mirrors the InvoiceMapper.toJSON() format from the C# reference.
 */
export const buildInvoiceJsonDump = (params: {
  machineName: string;
  customOfflineCreationTime: string;
  posShift: string;
  discountAmount: string;
  phase: string;
  offlineInvoiceNumber: string;
  posProfile: string;
  cashier: string;              // userId
  customerName: string;
  uniqueId: string;             // invoiceUUID
  customerPurchaseOrder: string;
  pih: string;                  // previous invoice hash
  payments: string;             // JSON array string: [{mode_of_payment, amount}]
  items: string;                // JSON array string: [{item_code, quantity, rate, uom, tax_rate}]
}): string => {
  return JSON.stringify({
    machine_name: params.machineName,
    custom_offline_creation_time: params.customOfflineCreationTime,
    pos_shift: params.posShift,
    discount_amount: params.discountAmount,
    phase: params.phase,
    offline_invoice_number: params.offlineInvoiceNumber,
    pos_profile: params.posProfile,
    cashier: params.cashier,
    customer_name: params.customerName,
    unique_id: params.uniqueId,
    Customer_Purchase_Order: params.customerPurchaseOrder,
    PIH: params.pih,
    payments: params.payments,
    items: params.items,
  });
};

/**
 * Sync an errored (uncleared) invoice to the server via form-urlencoded.
 * This is used when the original create_invoice call failed and the
 * invoice needs to be submitted as an uncleared record.
 */
export const syncUnclearedInvoiceToServer = async (
  params: UnclearedInvoiceSyncParams,
): Promise<void> => {
  const formData = new URLSearchParams();
  formData.append('date_time', params.dateTime);
  formData.append('invoice_number', params.invoiceNumber);
  formData.append('clearing_status', '0');
  formData.append('json_dump', params.jsonDump);
  formData.append('manually_submitted', '0');
  formData.append('api_response', params.apiResponse);
  formData.append('type', 'Sales Invoice');

  if (__DEV__) {
    console.log('[InvoiceApi] Syncing uncleared invoice to server:', {
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
      console.log('[InvoiceApi] Uncleared invoice synced successfully:', params.invoiceNumber);
    }
  } catch (error: any) {
    if (__DEV__) {
      console.error(
        '[InvoiceApi] Failed to sync uncleared invoice:',
        error?.response?.data || error.message,
      );
    }
    throw error;
  }
};

