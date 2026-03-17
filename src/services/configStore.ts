import type { AppConfig } from '@/src/features/app/types';
import * as SecureStore from 'expo-secure-store';

const CONFIG_COUNT_KEY = 'APP_CONFIG_COUNT';
const CONFIG_CHUNK_PREFIX = 'APP_CONFIG_';
const CHUNK_SIZE = 2000; // bytes, safely under the 2048 limit

/**
 * Save an AppConfig to expo-secure-store, chunking the JSON
 * across multiple keys to handle payloads > 2KB.
 */
export async function saveAppConfig(config: AppConfig): Promise<void> {
  console.log('[ConfigStore] Saving AppConfig...');
  const json = JSON.stringify(config);
  const chunks: string[] = [];

  for (let i = 0; i < json.length; i += CHUNK_SIZE) {
    chunks.push(json.slice(i, i + CHUNK_SIZE));
  }

  console.log(`[ConfigStore] JSON size: ${json.length} bytes, splitting into ${chunks.length} chunk(s)`);

  // Store each chunk
  for (let i = 0; i < chunks.length; i++) {
    console.log(`[ConfigStore] Saving chunk ${i + 1}/${chunks.length} (${chunks[i].length} bytes)`);
    await SecureStore.setItemAsync(`${CONFIG_CHUNK_PREFIX}${i}`, chunks[i]);
  }

  // Store the chunk count
  await SecureStore.setItemAsync(CONFIG_COUNT_KEY, String(chunks.length));
  console.log('[ConfigStore] AppConfig saved successfully');
}

/**
 * Retrieve the AppConfig from expo-secure-store by
 * reassembling all chunks.
 */
export async function getAppConfig(): Promise<AppConfig | null> {
  console.log('[ConfigStore] Retrieving AppConfig...');
  const countStr = await SecureStore.getItemAsync(CONFIG_COUNT_KEY);
  if (!countStr) {
    console.log('[ConfigStore] No config found in SecureStore');
    return null;
  }

  const count = parseInt(countStr, 10);
  if (isNaN(count) || count <= 0) {
    console.log('[ConfigStore] Invalid chunk count:', countStr);
    return null;
  }

  console.log(`[ConfigStore] Found ${count} chunk(s), reassembling...`);
  let json = '';
  for (let i = 0; i < count; i++) {
    const chunk = await SecureStore.getItemAsync(`${CONFIG_CHUNK_PREFIX}${i}`);
    if (chunk === null) {
      console.error(`[ConfigStore] Chunk ${i} is missing — config may be corrupted`);
      return null;
    }
    json += chunk;
  }

  try {
    const config = JSON.parse(json) as AppConfig;
    console.log('[ConfigStore] AppConfig retrieved successfully');
    return config;
  } catch {
    console.error('[ConfigStore] Failed to parse reassembled JSON');
    return null;
  }
}

/**
 * Check whether an AppConfig has been stored (i.e. app has been configured).
 */
export async function isConfigured(): Promise<boolean> {
  console.log('[ConfigStore] Checking if app is configured...');
  const countStr = await SecureStore.getItemAsync(CONFIG_COUNT_KEY);
  const configured = countStr !== null;
  console.log(`[ConfigStore] App configured: ${configured}`);
  return configured;
}

/**
 * Remove the stored AppConfig (all chunks + count key).
 */
export async function clearAppConfig(): Promise<void> {
  console.log('[ConfigStore] Clearing AppConfig...');
  const countStr = await SecureStore.getItemAsync(CONFIG_COUNT_KEY);
  if (countStr) {
    const count = parseInt(countStr, 10);
    console.log(`[ConfigStore] Deleting ${count} chunk(s)...`);
    for (let i = 0; i < count; i++) {
      await SecureStore.deleteItemAsync(`${CONFIG_CHUNK_PREFIX}${i}`);
    }
    await SecureStore.deleteItemAsync(CONFIG_COUNT_KEY);
    console.log('[ConfigStore] AppConfig cleared successfully');
  } else {
    console.log('[ConfigStore] No config to clear');
  }
}
