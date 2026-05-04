import { apiClient } from '@/src/services/api/httpClient';
import { logger } from '@/src/services/logger';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface OpenShiftApiParams {
  name: string; // shiftLocalId
  period_start_date: string; // formatted as 'YYYY-MM-DD HH:mm:ss'
  company: string;
  user: string; // user email
  pos_profile: string;
  balance_details: string; // JSON string of balance array
}

export interface OpenShiftApiResponse {
  data: {
    sync_id: string;
    period_start_date: string;
    posting_date: string;
    company: string;
    pos_profile: string;
    user: string;
    balance_details: {
      sync_id: string;
      mode_of_payment: string;
      opening_amount: number;
    }[];
  };
}

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Sync an open shift to the server.
 * Returns the server-generated sync_id (shift_opening_id).
 */
export const syncOpenShiftToServer = async (
  params: OpenShiftApiParams,
): Promise<string> => {
  try {
    const formData = new URLSearchParams();
    formData.append('name', params.name);
    formData.append('period_start_date', params.period_start_date);
    formData.append('company', params.company);
    formData.append('user', params.user);
    formData.append('pos_profile', params.pos_profile);
    formData.append('balance_details', params.balance_details);

    if (__DEV__) {
      console.log('[ShiftApi] Syncing shift with params:', {
        name: params.name,
        period_start_date: params.period_start_date,
        company: params.company,
        user: params.user,
        pos_profile: params.pos_profile,
        balance_details: params.balance_details,
      });
    }

    const response = await apiClient.post<OpenShiftApiResponse>(
      '/gpos.gpos.pos_shift.opening_shift',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const syncId = response.data.data.sync_id;

    if (!syncId) {
      throw new Error('Invalid API response — missing sync_id');
    }

    if (__DEV__) {
      console.log('[ShiftApi] Shift synced successfully, sync_id:', syncId);
    }

    return syncId;
  } catch (error: any) {
    if (__DEV__) {
      console.error('[ShiftApi] Failed to sync open shift:', error?.response?.data || error.message);
    }
    logger.recordError(error, 'SyncOpenShift');
    throw error;
  }
};

/**
 * Format a Date object to the API-expected format: 'YYYY-MM-DD HH:mm:ss'
 */
export const formatDateForApi = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

/**
 * Build the balance_details JSON string for the opening shift API.
 */
export const buildBalanceDetails = (openingCash: number): string => {
  return JSON.stringify([
    {
      mode_of_payment: 'Cash',
      opening_amount: openingCash.toFixed(2),
    },
  ]);
};

// ─── Closing Shift Types ─────────────────────────────────────────────────────

export interface CloseShiftApiParams {
  pos_opening_entry: string; // server shift opening ID (sync_id)
  company: string;
  period_end_date: string; // formatted as 'YYYY-MM-DD HH:mm:ss'
  payment_reconciliation: string; // JSON string of payment array
  details: string; // JSON string of shift details
  name: string; // same as pos_opening_entry (server shift opening ID)
  created_invoice_status: 'synced' | 'unsynced';
}

export interface ShiftInvoiceDetails {
  number_of_invoices: number;
  number_of_return_invoices: number;
  total_of_invoices: number;
  total_of_returns: number;
  total_of_cash: number;
  total_of_return_cash: number;
  total_of_bank: number;
  total_of_return_bank: number;
}

// ─── Closing Shift API ───────────────────────────────────────────────────────

/**
 * Sync a closed shift to the server.
 */
export const syncCloseShiftToServer = async (
  params: CloseShiftApiParams,
): Promise<void> => {
  try {
    const formData = new URLSearchParams();
    formData.append('pos_opening_entry', params.pos_opening_entry);
    formData.append('company', params.company);
    formData.append('period_end_date', params.period_end_date);
    formData.append('payment_reconciliation', params.payment_reconciliation);
    formData.append('details', params.details);
    formData.append('name', params.name);
    formData.append('created_invoice_status', params.created_invoice_status);

    if (__DEV__) {
      console.log('[ShiftApi] Syncing close shift with params:', {
        pos_opening_entry: params.pos_opening_entry,
        company: params.company,
        period_end_date: params.period_end_date,
        payment_reconciliation: params.payment_reconciliation,
        details: params.details,
        name: params.name,
        created_invoice_status: params.created_invoice_status,
      });
    }

    await apiClient.post(
      '/gpos.gpos.pos_shift.closing_shift',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (__DEV__) {
      console.log('[ShiftApi] Close shift synced successfully');
    }
  } catch (error: any) {
    if (__DEV__) {
      console.error(
        '[ShiftApi] Failed to sync close shift:',
        error?.response?.data || error.message,
      );
    }
    logger.recordError(error, 'SyncCloseShift');
    throw error;
  }
};

/**
 * Build the payment_reconciliation JSON string for the closing shift API.
 */
export const buildPaymentReconciliation = (params: {
  openingCash: number;
  expectedCash: number;
  closingCash: number;
  expectedCard: number;
  closingCard: number;
}): string => {
  return JSON.stringify([
    {
      mode_of_payment: 'Cash',
      opening_amount: params.openingCash.toFixed(2),
      expected_amount: params.expectedCash.toFixed(2),
      closing_amount: params.closingCash.toFixed(2),
    },
    {
      mode_of_payment: 'Card',
      opening_amount: '0.00',
      expected_amount: params.expectedCard.toFixed(2),
      closing_amount: params.closingCard.toFixed(2),
    },
  ]);
};

/**
 * Build the details JSON string for the closing shift API.
 */
export const buildShiftDetails = (details: ShiftInvoiceDetails): string => {
  return JSON.stringify({
    number_of_invoices: details.number_of_invoices,
    number_of_return_invoices: details.number_of_return_invoices,
    total_of_invoices: details.total_of_invoices,
    total_of_returns: details.total_of_returns,
    total_of_cash: details.total_of_cash,
    total_of_return_cash: details.total_of_return_cash,
    total_of_bank: details.total_of_bank,
    total_of_return_bank: details.total_of_return_bank,
  });
};
