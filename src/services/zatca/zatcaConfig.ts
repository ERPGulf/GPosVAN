/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – central configuration                         */
/*  Populate with real values from your ZATCA onboarding.              */
/* ------------------------------------------------------------------ */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Address, CertificateConfig, SupplierParty } from './types';
import { Zatca } from '@/src/utils/constants/app.settings';

const PIH_STORAGE_KEY = 'ZATCA_PIH';

/* ─── Default / initial PIH (base-64 SHA-256 of empty or first invoice) ─── */
const DEFAULT_PIH = Zatca.Pih;

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
    'TUlJRDNqQ0NBNFNnQXdJQkFnSVRFUUFBT0FQRjkwQWpzL3hjWHdBQkFBQTRBekFLQmdncWhrak9QUVFEQWpCaU1SVXdFd1lLQ1pJbWlaUHlMR1FCR1JZRmJHOWpZV3d4RXpBUkJnb0praWFKay9Jc1pBRVpGZ05uYjNZeEZ6QVZCZ29Ka2lhSmsvSXNaQUVaRmdkbGVIUm5ZWHAwTVJzd0dRWURWUVFERXhKUVVscEZTVTVXVDBsRFJWTkRRVFF0UTBFd0hoY05NalF3TVRFeE1Ea3hPVE13V2hjTk1qa3dNVEE1TURreE9UTXdXakIxTVFzd0NRWURWUVFHRXdKVFFURW1NQ1FHQTFVRUNoTWRUV0Y0YVcxMWJTQlRjR1ZsWkNCVVpXTm9JRk4xY0hCc2VTQk1WRVF4RmpBVUJnTlZCQXNURFZKcGVXRmthQ0JDY21GdVkyZ3hKakFrQmdOVkJBTVRIVlJUVkMwNE9EWTBNekV4TkRVdE16azVPVGs1T1RrNU9UQXdNREF6TUZZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUFvRFFnQUVvV0NLYTBTYTlGSUVyVE92MHVBa0MxVklLWHhVOW5QcHgydmxmNHloTWVqeThjMDJYSmJsRHE3dFB5ZG84bXEwYWhPTW1Obzhnd25pN1h0MUtUOVVlS09DQWdjd2dnSURNSUd0QmdOVkhSRUVnYVV3Z2FLa2daOHdnWnd4T3pBNUJnTlZCQVFNTWpFdFZGTlVmREl0VkZOVWZETXRaV1F5TW1ZeFpEZ3RaVFpoTWkweE1URTRMVGxpTlRndFpEbGhPR1l4TVdVME5EVm1NUjh3SFFZS0NaSW1pWlB5TEdRQkFRd1BNems1T1RrNU9UazVPVEF3TURBek1RMHdDd1lEVlFRTURBUXhNVEF3TVJFd0R3WURWUVFhREFoU1VsSkVNamt5T1RFYU1CZ0dBMVVFRHd3UlUzVndjR3g1SUdGamRHbDJhWFJwWlhNd0hRWURWUjBPQkJZRUZFWCtZdm1tdG5Zb0RmOUJHYktvN29jVEtZSzFNQjhHQTFVZEl3UVlNQmFBRkp2S3FxTHRtcXdza0lGelZ2cFAyUHhUKzlObk1Ic0dDQ3NHQVFVRkJ3RUJCRzh3YlRCckJnZ3JCZ0VGQlFjd0FvWmZhSFIwY0RvdkwyRnBZVFF1ZW1GMFkyRXVaMjkyTG5OaEwwTmxjblJGYm5KdmJHd3ZVRkphUlVsdWRtOXBZMlZUUTBFMExtVjRkR2RoZW5RdVoyOTJMbXh2WTJGc1gxQlNXa1ZKVGxaUFNVTkZVME5CTkMxRFFTZ3hLUzVqY25Rd0RnWURWUjBQQVFIL0JBUURBZ2VBTUR3R0NTc0dBUVFCZ2pjVkJ3UXZNQzBHSlNzR0FRUUJnamNWQ0lHR3FCMkUwUHNTaHUyZEpJZk8reG5Ud0ZWbWgvcWxaWVhaaEQ0Q0FXUUNBUkl3SFFZRFZSMGxCQll3RkFZSUt3WUJCUVVIQXdNR0NDc0dBUVVGQndNQ01DY0dDU3NHQVFRQmdqY1ZDZ1FhTUJnd0NnWUlLd1lCQlFVSEF3TXdDZ1lJS3dZQkJRVUhBd0l3Q2dZSUtvWkl6ajBFQXdJRFNBQXdSUUloQUxFL2ljaG1uV1hDVUtVYmNhM3ljaThvcXdhTHZGZEhWalFydmVJOXVxQWJBaUE5aEM0TThqZ01CQURQU3ptZDJ1aVBKQTZnS1IzTEUwM1U3NWVxYkMvclhBPT0=',
  privateKeyBase64:
    'LS0tLS1CRUdJTiBFQyBQUklWQVRFIEtFWS0tLS0tCk1IUUNBUUVFSU90OGhuM1NpY0FLR2JlTnJOcS81bE5sUWpCajBMbmF1NStCY1JRLzM2M2tvQWNHQlN1QkJBQUsKb1VRRFFnQUU0R1RsOXhaQTFob0hQZ25WdjRKWVk5a3l2WGM2Z3JpQkduVXFydno0NXVINVRveHJUWGV6elBzegpncTZ1eFRrNi9PQkhEWEJQaTRZdlBySzU5NEJmY1E9PQotLS0tLUVORCBFQyBQUklWQVRFIEtFWS0tLS0tCg==',
};
// public_key:
// 'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUZZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUFvRFFnQUVvV0NLYTBTYTlGSUVyVE92MHVBa0MxVklLWHhVOW5QcAp4MnZsZjR5aE1lank4YzAyWEpibERxN3RQeWRvOG1xMGFoT01tTm84Z3duaTdYdDFLVDlVZUE9PQotLS0tLUVORCBQVUJMSUMgS0VZLS0tLS0K',

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
