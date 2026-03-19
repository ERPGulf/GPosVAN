import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ZatcaConfig } from '../types';
import { zatcaLogger } from './zatcaLogger';
import { TEST_ZATCA_SETTINGS_PAYLOAD } from './zatcaTestPayload';

const ZATCA_CONFIG_KEY = '@zatca_config';

type MaybeBooleanNumber = boolean | number | null | undefined;

interface BackendZatcaAddress {
  address_line1?: string | null;
  city?: string | null;
  pincode?: string | number | null;
  country?: string | null;
  building_number?: string | number | null;
}

interface BackendZatcaConfig {
  certificate?: string | null;
  public_key?: string | null;
  private_key?: string | null;
  tax_id?: string | null;
  company_taxid?: string | null;
  company_registration_no?: string | null;
  Abbr?: string | null;
  company_name?: string | null;
  is_tax_included_in_price?: MaybeBooleanNumber;
  address?: BackendZatcaAddress | null;
}

export interface BackendConfigPayload {
  zatca?: BackendZatcaConfig | null;
  is_tax_included_in_price?: MaybeBooleanNumber;
}

function getForcedTestZatcaConfig(): ZatcaConfig {
  // TODO: Remove this override and restore backend/storage-driven config after the
  // certificate encoding issue is resolved consistently across devices.
  return normalizeBackendZatcaConfig(TEST_ZATCA_SETTINGS_PAYLOAD);
}

function toBool(value: MaybeBooleanNumber, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return fallback;
}

function asRequiredString(value: string | null | undefined, field: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Invalid ZATCA config: missing ${field}`);
  }
  return trimmed;
}

function inferCountryCode(country: string): string {
  const normalized = country.toLowerCase();
  if (normalized.includes('saudi')) return 'SA';
  if (normalized.includes('qatar')) return 'QA';
  if (normalized.includes('uae') || normalized.includes('emirates')) return 'AE';
  return 'SA';
}

/**
 * Maps backend payload shape (snake_case + nested zatca object)
 * to app shape (camelCase ZatcaConfig).
 */
export function normalizeBackendZatcaConfig(payload: BackendConfigPayload): ZatcaConfig {
  const source = payload.zatca;
  if (!source) {
    throw new Error('Invalid ZATCA config: payload.zatca is missing');
  }

  const address = source.address ?? {};
  const country = (address.country ?? 'Saudi Arabia').trim();

  return {
    certificate: asRequiredString(source.certificate, 'zatca.certificate'),
    publicKey: asRequiredString(source.public_key, 'zatca.public_key'),
    privateKey: asRequiredString(source.private_key, 'zatca.private_key'),
    taxId: asRequiredString(source.tax_id ?? source.company_taxid, 'zatca.tax_id/company_taxid'),
    companyRegistrationNo: asRequiredString(
      source.company_registration_no,
      'zatca.company_registration_no',
    ),
    abbr: (source.Abbr ?? source.company_name ?? 'Company').trim(),
    address: {
      streetName: (address.address_line1 ?? '').trim(),
      buildingNumber: String(address.building_number ?? ''),
      plotIdentification: (address.address_line1 ?? '').trim(),
      citySubdivisionName: (address.city ?? '').trim(),
      cityName: (address.city ?? '').trim(),
      postalZone: String(address.pincode ?? ''),
      countrySubentity: country,
      countryCode: inferCountryCode(country),
    },
    isTaxIncludedInPrice: toBool(
      source.is_tax_included_in_price,
      toBool(payload.is_tax_included_in_price, false),
    ),
  };
}

/**
 * Normalizes backend payload and stores the result in AsyncStorage.
 */
export async function setZatcaConfigFromBackend(
  payload: BackendConfigPayload,
): Promise<ZatcaConfig> {
  zatcaLogger.info('Using hardcoded ZATCA test payload instead of backend payload');
  const normalized = getForcedTestZatcaConfig();
  await setZatcaConfig(normalized);
  zatcaLogger.info('ZATCA config normalized and stored', {
    taxId: normalized.taxId,
    companyRegistrationNo: normalized.companyRegistrationNo,
  });
  return normalized;
}

export async function getZatcaConfig(): Promise<ZatcaConfig | null> {
  const config = getForcedTestZatcaConfig();
  await setZatcaConfig(config);
  zatcaLogger.debug('Loaded hardcoded ZATCA test config', {
    hasTaxId: Boolean(config.taxId),
    hasCertificate: Boolean(config.certificate),
    isTaxIncludedInPrice: config.isTaxIncludedInPrice,
  });
  return config;
}

/**
 * Tries to hydrate ZATCA config from common stored settings payloads.
 * If found and valid, writes normalized config into @zatca_config and returns it.
 */
export async function hydrateZatcaConfigFromStorage(): Promise<ZatcaConfig | null> {
  const normalized = getForcedTestZatcaConfig();
  await setZatcaConfig(normalized);
  zatcaLogger.info('Hydrated ZATCA config from hardcoded test payload', {
    taxId: normalized.taxId,
  });
  return normalized;
}

export async function setZatcaConfig(config: ZatcaConfig): Promise<void> {
  await AsyncStorage.setItem(ZATCA_CONFIG_KEY, JSON.stringify(config));
  zatcaLogger.debug('Stored ZATCA config in storage', {
    hasTaxId: Boolean(config.taxId),
    hasCertificate: Boolean(config.certificate),
    isTaxIncludedInPrice: config.isTaxIncludedInPrice,
  });
}
