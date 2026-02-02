import { apiClient } from './client';

export const offlineUserApi = async () => {
  try {
    const response = await apiClient.get('/gpos.gpos.pos.getOfflinePOSUsers');
    return response.data;
  } catch (error) {
    console.error('Error fetching offline users:', error);
    return [];
  }
};
