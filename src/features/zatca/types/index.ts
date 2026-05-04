import type { CartItem } from '@/src/features/cart/types';

// ZATCA Invoice Types
export type InvoiceTypeCode = '388' | '381'; // 388=standard/simplified, 381=credit/debit note
export type InvoiceSubType = '0100000' | '0200000'; // 0100000=standard (B2B), 0200000=simplified (B2C)

export interface ZatcaAddress {
  streetName: string;
  buildingNumber: string;
  plotIdentification: string;
  citySubdivisionName: string;
  cityName: string;
  postalZone: string;
  countrySubentity: string;
  countryCode: string;
}

export interface ZatcaConfig {
  certificate: string; // base64-encoded certificate content
  publicKey: string; // base64-encoded PEM public key
  privateKey: string; // base64-encoded PEM private key
  taxId: string; // VAT registration number
  companyRegistrationNo: string; // CRN
  abbr: string; // Company abbreviation/name
  address: ZatcaAddress;
  isTaxIncludedInPrice: boolean;
}

export interface InvoiceCustomer {
  id: string | null;
  name: string | null;
  phoneNo: string | null;
  taxId?: string | null;
  buyerId?: string | null;
  buyerIdType?: string | null;
  address?: Partial<ZatcaAddress>;
}

export interface InvoiceParams {
  invoiceUUID: string;
  customer: InvoiceCustomer;
  cartItems: CartItem[];
  tax: number;
  totalExcludeTax: number;
  invoiceDate: Date;
  previousInvoiceHash: string;
  invoiceNumber: string;
  discount: number;
  invoiceTypeCode: InvoiceTypeCode;
  invoiceSubType: InvoiceSubType;
  billingReference?: string; // original invoice ID for credit notes (type 381)
  creditNoteReason?: string; // KSA-10: reason for credit/debit note (required for type 381)
}

export interface InvoiceResult {
  xml: string;
  qrData: string;
  invoiceHash: string; // To be stored as PIH for the next invoice
}
