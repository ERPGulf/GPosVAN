import type { AppConfig } from '@/src/features/app/types';
import { apiClient } from '@/src/services/api/httpClient';

/**
 * Fetch POS settings from the server.
 *
 * Endpoint: GET /gpos.gpos.pos.pos_setting
 * Params: machine_name, pos_profile (sent as URL-encoded form data)
 * Auth: Bearer user token (attached by apiClient interceptor)
 *
 * Returns the parsed AppConfig from the response `data` field.
 */
export async function fetchPosSettings(
  machineName: string,
  posProfile: string,
): Promise<AppConfig> {
  console.log('[PosSettings] Fetching pos_settings...', { machineName, posProfile });

  const params = new URLSearchParams();
  params.append('machine_name', machineName);
  params.append('pos_profile', posProfile);

  const response = await apiClient.get<{ data: AppConfig }>(
    '/gpos.gpos.pos.pos_setting',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      params,
    },
  );

  const config = response.data.data;

  if (!config || typeof config !== 'object') {
    throw new Error('Invalid pos_setting response — missing data');
  }

  console.log('[PosSettings] pos_settings fetched successfully');
  return config;
}
