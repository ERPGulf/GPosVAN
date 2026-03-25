import { getAppConfig } from '@/src/services/configStore';
import type { BackendConfigPayload } from './zatcaConfig';

/**
 * Build a BackendConfigPayload from the AppConfig stored in
 * expo-secure-store (uploaded during first-launch setup).
 *
 * Returns `null` when no config has been stored yet.
 */
export async function getZatcaPayloadFromSecureStore(): Promise<BackendConfigPayload | null> {
  const appConfig = await getAppConfig();
  if (!appConfig) {
    console.warn('[ZATCA] No AppConfig found in SecureStore. Cannot build payload.');
    return null;
  }

  const z = appConfig.zatca;
  if (!z) {
    console.warn('[ZATCA] AppConfig has no zatca section.');
    return null;
  }

  return {
    zatca: {
      company_name: z.company_name,
      tax_id: z.tax_id,
      company_taxid: z.tax_id,
      company_registration_no: z.company_registration_no,
      Abbr: z.Abbr,
      certificate: z.certificate,
      private_key: z.private_key,
      public_key: z.public_key,
      pih: z.pih,
      address: z.address
        ? {
            address_line1: z.address.address_line1,
            city: z.address.city,
            pincode: z.address.pincode,
            country: z.address.county,
            building_number: z.address.building_number,
          }
        : undefined,
    },
    is_tax_included_in_price: appConfig.inclusive,
  } as BackendConfigPayload;
}
