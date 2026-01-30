import { apiClient } from '@/src/services/api/httpClient';

export const offlineUserApi = async () => {
  try {
    const response = await apiClient.get('/gpos.gpos.pos.getOfflinePOSUsers');
    return response.data;
  } catch (error) {
    console.error('Error fetching offline users:', error);
    throw error;
  }
};
