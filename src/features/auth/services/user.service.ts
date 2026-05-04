import { tokenClient } from '@/src/services/api/httpClient';
import { logger } from '@/src/services/logger';

/**
 * Fetch offline POS users from the API.
 * This API does not require authentication — uses tokenClient (no auth header).
 */
export const userApi = async () => {
  try {
    const response = await tokenClient.get('/gpos.gpos.pos.getOfflinePOSUsers');

    return response.data;
  } catch (error) {
    console.error('[UserService] Error fetching offline users:', error);
    logger.recordError(error, 'FetchOfflineUsers');
    throw error;
  }
};

