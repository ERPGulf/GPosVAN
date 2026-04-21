import { apiClient } from '@/src/services/api/httpClient';
import { GetPromotionsResponse } from '../types/promotionApi.types';

/**
 * Fetch all promotions from the API for the given POS profile.
 *
 * @param posProfile - The POS profile (branch) to fetch promotions for
 * @returns Promise with the API response containing promotions and their items
 */
export const fetchPromotions = async (posProfile: string): Promise<GetPromotionsResponse> => {
  const params = new URLSearchParams();
  params.append('pos_profile', posProfile);

  const response = await apiClient.get<GetPromotionsResponse>('/gpos.gpos.pos.get_promotion_list', {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    params,
  });

  return response.data;
};
