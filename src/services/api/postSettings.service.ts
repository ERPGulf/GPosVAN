import { apiClient } from './httpClient';

export interface PosSettingsResponse {
  message?: any;
}

/**
 * Fetch POS settings
 * Defaults match curl command
 */
export const fetchPosSettings = async (
  machineName: string = 'diaj6ei8fh',
  posProfile: string = 'test pos profile',
): Promise<PosSettingsResponse> => {
  try {
    const response = await apiClient.get<PosSettingsResponse>('/gpos.gpos.pos.pos_setting', {
      params: {
        machine_name: machineName,
        pos_profile: posProfile,
      },
    });

    console.log('[POS SETTINGS] Response:', response.data);

    return response.data;
  } catch (error: any) {
    console.error('[POS SETTINGS] API Error:', error?.response?.data || error.message);
    throw error;
  }
};
