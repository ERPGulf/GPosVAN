import * as SecureStore from 'expo-secure-store';

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * Shape of the Settings section in the setup JSON uploaded by the user.
 */
export interface SetupSettings {
  Host: string;
  API_KEY: string;
  API_SECRET: string;
  APP_KEY: string;
  CLIENT_SECRET: string;
  MACHINE_NAME: string;
  INVOICE_PREFIX: string;
  BRANCH_ID: string;
}

// ─── SecureStore Keys ────────────────────────────────────────────────────────

const KEYS = {
  HOST: 'GPOS_CRED_HOST',
  API_KEY: 'GPOS_CRED_API_KEY',
  API_SECRET: 'GPOS_CRED_API_SECRET',
  APP_KEY: 'GPOS_CRED_APP_KEY',
  CLIENT_SECRET: 'GPOS_CRED_CLIENT_SECRET',
  MACHINE_NAME: 'GPOS_CRED_MACHINE_NAME',
  INVOICE_PREFIX: 'GPOS_CRED_INVOICE_PREFIX',
  BRANCH_ID: 'GPOS_CRED_BRANCH_ID',
} as const;

// In-memory cache to avoid hitting SecureStore on every request
let cachedHost: string | null = null;

// ─── Save / Clear ────────────────────────────────────────────────────────────

/**
 * Save all 8 credential fields to Expo SecureStore as individual keys.
 */
export async function saveCredentials(settings: SetupSettings): Promise<void> {
  console.log('[CredentialStore] Saving credentials...');
  await Promise.all([
    SecureStore.setItemAsync(KEYS.HOST, settings.Host),
    SecureStore.setItemAsync(KEYS.API_KEY, settings.API_KEY),
    SecureStore.setItemAsync(KEYS.API_SECRET, settings.API_SECRET),
    SecureStore.setItemAsync(KEYS.APP_KEY, settings.APP_KEY),
    SecureStore.setItemAsync(KEYS.CLIENT_SECRET, settings.CLIENT_SECRET),
    SecureStore.setItemAsync(KEYS.MACHINE_NAME, settings.MACHINE_NAME),
    SecureStore.setItemAsync(KEYS.INVOICE_PREFIX, settings.INVOICE_PREFIX),
    SecureStore.setItemAsync(KEYS.BRANCH_ID, settings.BRANCH_ID),
  ]);
  // Update cache
  cachedHost = settings.Host;
  console.log('[CredentialStore] Credentials saved successfully');
}

/**
 * Remove all stored credentials from SecureStore.
 */
export async function clearCredentials(): Promise<void> {
  console.log('[CredentialStore] Clearing credentials...');
  await Promise.all(
    Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)),
  );
  cachedHost = null;
  console.log('[CredentialStore] Credentials cleared');
}

// ─── Individual Getters ──────────────────────────────────────────────────────

/**
 * Get the Host URL. Uses in-memory cache for performance.
 */
export async function getHostUrl(): Promise<string | null> {
  if (cachedHost) return cachedHost;
  const val = await SecureStore.getItemAsync(KEYS.HOST);
  if (val) cachedHost = val;
  return val;
}

export async function getApiKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.API_KEY);
}

export async function getApiSecret(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.API_SECRET);
}

export async function getAppKey(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.APP_KEY);
}

export async function getClientSecret(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.CLIENT_SECRET);
}

export async function getMachineName(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.MACHINE_NAME);
}

export async function getInvoicePrefix(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.INVOICE_PREFIX);
}

export async function getBranchId(): Promise<string | null> {
  return SecureStore.getItemAsync(KEYS.BRANCH_ID);
}

// ─── Utility ─────────────────────────────────────────────────────────────────

/**
 * Check whether credentials have been stored (i.e. app has been configured).
 */
export async function isConfigured(): Promise<boolean> {
  const host = await SecureStore.getItemAsync(KEYS.HOST);
  return host !== null;
}

/**
 * Validate that a parsed JSON object matches the SetupSettings shape.
 */
export function validateSetupJson(data: unknown): data is { Settings: SetupSettings } {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  if (typeof obj.Settings !== 'object' || obj.Settings === null) return false;
  const settings = obj.Settings as Record<string, unknown>;

  const requiredKeys: (keyof SetupSettings)[] = [
    'Host',
    'API_KEY',
    'API_SECRET',
    'APP_KEY',
    'CLIENT_SECRET',
    'MACHINE_NAME',
    'INVOICE_PREFIX',
    'BRANCH_ID',
  ];

  for (const key of requiredKeys) {
    if (typeof settings[key] !== 'string' || !settings[key]) {
      return false;
    }
  }

  return true;
}
