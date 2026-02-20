import { apiClient } from '@/src/services/api/httpClient';
import { GetItemsResponse } from '../types/productApi.types';

/**
 * Fetch all products from the API
 * @returns Promise with the API response containing item groups and products
 */
export const fetchProducts = async (): Promise<GetItemsResponse> => {
  const response = await apiClient.get<GetItemsResponse>('/gpos.gpos.pos.get_items');
  return response.data;
};
