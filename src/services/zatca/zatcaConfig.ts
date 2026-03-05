/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – central configuration                         */
/*  Populate with real values from your ZATCA onboarding.              */
/* ------------------------------------------------------------------ */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, CertificateConfig, SupplierParty } from './types';

const PIH_STORAGE_KEY = 'ZATCA_PIH';

/* ─── Default / initial PIH (base-64 SHA-256 of empty or first invoice) ─── */
const DEFAULT_PIH =
  'NWZlY2ViNjZmZmM4NmJkMmE2NWQzZDBkYzEyNjUwOTAyNzllMzZhN2M1ZTBkNjEyYjk5OGNlZDQzMjRlMTRhZA==';

/* ─── Supplier / seller information ─── */
const supplierAddress: Address = {
  street: 'Prince Sultan Road',
  buildingNumber: '0000',
  plotIdentification: 'Prince Sultan Road',
  citySubdivision: 'Riyadh',
  city: 'Riyadh',
  postalZone: '000000',
  countrySubentity: 'Saudi Arabia',
  countryCode: 'SA',
};

export const supplier: SupplierParty = {
  registrationName: 'My Shop', // TODO: replace with real name
  vatNumber: '300000000000003', // TODO: replace with real VAT ID
  companyRegistrationNo: '1010000000', // TODO: replace with real CRN
  address: supplierAddress,
};

/* ─── Certificate ─── */
export const certificate: CertificateConfig = {
  certificateBase64:
    'TUlJQ09EQ0NBZDZnQXdJQkFnSUdBWmhDcHo5Y01Bb0dDQ3FHU000OUJBTUNNQlV4RXpBUkJnTlZCQU1NQ21WSmJuWnZhV05wYm1jd0hoY05NalV3TnpJMU1UY3pOVEE0V2hjTk16QXdOekkwTWpFd01EQXdXakJ5TVFzd0NRWURWUVFHRXdKVFFURVlNQllHQTFVRUN3d1BNekV5TkRFNU1UY3dNVEF3TURBek1TRXdId1lEVlFRS0RCaEtZWGRoWkNCQmJHUnBZV1poSUZSeVlXUnBibWNnUTI4eEpqQWtCZ05WQkFNTUhWUlRWQzA0T0RZME16RXhORFV0TXpFeU5ERTVNVGN3TVRBd01EQXpNRll3RUFZSEtvWkl6ajBDQVFZRks0RUVBQW9EUWdBRW56VVI3V1BTTVhQSGpGUElNcVpWTjlDQ1AyN2FmazZyaTlhUDVONUFKNkR1MUNBbTU4RWk2WnFFamEwelljZW9nL1JEWjlNZWRYS2FvN1JwUS9WZlc2T0J2ekNCdkRBTUJnTlZIUk1CQWY4RUFqQUFNSUdyQmdOVkhSRUVnYU13Z2FDa2daMHdnWm94TnpBMUJnTlZCQVFNTGpFdFZGTlVmREl0VkZOVWZETXRNak0yT1RBNE5qZ3RNR1JsTXkxbU9EazNMVFZqWldVdFl6RmxZbVJsTURZeEh6QWRCZ29Ka2lhSmsvSXNaQUVCREE4ek1USTBNVGt4TnpBeE1EQXdNRE14RFRBTEJnTlZCQXdNQkRFeE1EQXhEekFOQmdOVkJCb01Ca3BsWkdSaGFERWVNQndHQTFVRUR3d1ZVbVZoYkNCbGMzUmhkR1VnWVdOMGFYWnBkR1Z6TUFvR0NDcUdTTTQ5QkFNQ0EwZ0FNRVVDSUV4TXZwMGVmV3NYUWFQYjEybklPYlNHdEtLRk8vdFVYcU1NWU85L1dhRURBaUVBMlBzNjkrTTZuWWVJV25JT0lHZGxIZFplTjJsMVk1K1ZnK0J2YnY5MkcvOD0=', // TODO: paste base-64 certificate (no PEM headers)
  privateKeyBase64:
    'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUZZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUFvRFFnQUVnT0xiQzNSWWlnZUJFSG5aYTBWMVFTMmk2VW03SURLdQpEa3JFb1VYNGlVekMxalRJNjA4dnM5NkdPekFrQmd3UGRZQXoxNnNnVVVLRlBUR3phZCtZR1E9PQotLS0tLUVORCBQVUJMSUMgS0VZLS0tLS0=', // TODO: paste base-64 private key  (no PEM headers)
};

/* ─── Global flags ─── */
export const isTaxIncludedInPrice = true;

/* ─── PIH helpers ─── */
export async function getPreviousInvoiceHash(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(PIH_STORAGE_KEY);
    return stored ?? DEFAULT_PIH;
  } catch {
    return DEFAULT_PIH;
  }
}

export async function savePreviousInvoiceHash(hash: string): Promise<void> {
  await AsyncStorage.setItem(PIH_STORAGE_KEY, hash);
}
