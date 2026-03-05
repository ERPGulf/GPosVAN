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
  certificateBase64: '', // TODO: paste base-64 certificate (no PEM headers)
  privateKeyBase64: '', // TODO: paste base-64 private key  (no PEM headers)
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
