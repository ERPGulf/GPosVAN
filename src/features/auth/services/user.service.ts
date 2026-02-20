import { apiClient } from '@/src/services/api/httpClient';

export const userApi = async () => {
  try {
    const response = await apiClient.get('/gpos.gpos.pos.getOfflinePOSUsers');
    console.log('Reponse from api', response.data);
    return response.data;
  } catch (error) {
    console.error('Error fetching offline users:', error);
    throw error;
  }
};
