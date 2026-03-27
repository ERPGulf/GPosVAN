import { tokenClient } from '@/src/services/api/httpClient';

/**
 * Fetch offline POS users from the API.
 * This API does not require authentication — uses tokenClient (no auth header).
 */
export const userApi = async () => {
  try {
    const response = await tokenClient.get('/gpos.gpos.pos.getOfflinePOSUsers');
    if (__DEV__) {
      console.log('[UserService] Response from API:', response.data);
    }
    return response.data;
  } catch (error) {
    console.error('[UserService] Error fetching offline users:', error);
    throw error;
  }
};
