import type { BackendConfigPayload } from './zatcaConfig';

function clean(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toNum(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parsePayloadFromEnv(): BackendConfigPayload {
  const phase = clean(process.env.EXPO_PUBLIC_ZATCA_PHASE);
  const isTaxIncludedInPrice = clean(process.env.EXPO_PUBLIC_ZATCA_IS_TAX_INCLUDED_IN_PRICE);
  const taxPercentage = clean(process.env.EXPO_PUBLIC_ZATCA_TAX_PERCENTAGE);
  const companyName = clean(process.env.EXPO_PUBLIC_ZATCA_COMPANY_NAME);
  const abbr = clean(process.env.EXPO_PUBLIC_ZATCA_ABBR);
  const taxIdValue = clean(process.env.EXPO_PUBLIC_ZATCA_TAX_ID);
  const companyTaxId = clean(process.env.EXPO_PUBLIC_ZATCA_COMPANY_TAXID);
  const companyRegistrationNo = clean(process.env.EXPO_PUBLIC_ZATCA_COMPANY_REGISTRATION_NO);
  const linkedDoctype = clean(process.env.EXPO_PUBLIC_ZATCA_LINKED_DOCTYPE);
  const pih = clean(process.env.EXPO_PUBLIC_ZATCA_PIH);
  const certificate = clean(process.env.EXPO_PUBLIC_ZATCA_CERTIFICATE);
  const privateKey = clean(process.env.EXPO_PUBLIC_ZATCA_PRIVATE_KEY);
  const publicKey = clean(process.env.EXPO_PUBLIC_ZATCA_PUBLIC_KEY);
  const addressLine1 = clean(process.env.EXPO_PUBLIC_ZATCA_ADDRESS_LINE1);
  const addressCity = clean(process.env.EXPO_PUBLIC_ZATCA_ADDRESS_CITY);
  const addressPincode = clean(process.env.EXPO_PUBLIC_ZATCA_ADDRESS_PINCODE);
  const addressCountry = clean(process.env.EXPO_PUBLIC_ZATCA_ADDRESS_COUNTRY);
  const addressBuildingNumber = clean(process.env.EXPO_PUBLIC_ZATCA_ADDRESS_BUILDING_NUMBER);

  const taxId = taxIdValue ?? companyTaxId;

  if (!certificate || !privateKey || !publicKey || !taxId) {
    console.warn('[ZATCA] Missing required key-value envs for test payload. Using empty payload.');
    return {} as BackendConfigPayload;
  }

  return {
    phase: phase ?? 'Phase-2',
    is_tax_included_in_price: toNum(isTaxIncludedInPrice, 0),
    tax_percentage: toNum(taxPercentage, 0),
    zatca: {
      company_name: companyName ?? 'Company',
      phase: phase ?? 'Phase-2',
      company_taxid: companyTaxId ?? taxId,
      certificate,
      pih: pih ?? '',
      Abbr: abbr ?? 'Company',
      tax_id: taxId,
      private_key: privateKey,
      public_key: publicKey,
      linked_doctype: linkedDoctype ?? 'erpgulf',
      company_registration_no: companyRegistrationNo ?? '0000000',
      address: {
        address_line1: addressLine1 ?? '',
        city: addressCity ?? '',
        pincode: toNum(addressPincode, 0),
        country: addressCountry ?? 'Saudi Arabia',
        building_number: toNum(addressBuildingNumber, 0),
      },
    },
  } as unknown as BackendConfigPayload;
}

// Test payload provided via .env.local key-value pairs for local/dev validation.
export const TEST_ZATCA_SETTINGS_PAYLOAD: BackendConfigPayload = parsePayloadFromEnv();
