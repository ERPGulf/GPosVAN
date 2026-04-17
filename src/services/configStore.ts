import {
  clearCredentials,
  isConfigured as credentialIsConfigured,
} from '@/src/services/credentialStore';

/**
 * Check whether credentials have been stored (i.e. app has been configured).
 * Delegates to credentialStore.
 */
export async function isConfigured(): Promise<boolean> {
  return credentialIsConfigured();
}

/**
 * Clear all stored credentials/config.
 * Delegates to credentialStore.
 */
export async function clearAppConfig(): Promise<void> {
  await clearCredentials();
}
