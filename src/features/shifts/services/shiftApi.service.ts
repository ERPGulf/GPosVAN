import { apiClient } from '@/src/services/api/httpClient';

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
