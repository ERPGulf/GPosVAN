export interface Supplier {
  registrationName: string;
  vatNumber: string;

  companyRegistrationNumber?: string;

  address?: {
    street?: string;
    buildingNumber?: string;
    city?: string;
    postalCode?: string;
    country?: string;
  };
}

export interface Customer {
  id?: string;
  name?: string;
  vatNumber?: string;
}

export interface InvoiceItem {
  id?: string;

  name: string;

  quantity: number;

  price: number;

  vatRate?: number;

  unitCode?: string;

  discount?: number;
}

export interface InvoiceTotals {
  totalExclVAT: number;

  totalVAT: number;

  totalInclVAT: number;

  discount?: number;
}

export interface InvoiceInput {
  uuid?: string;

  number: string;

  date: string;

  time?: string;

  timestamp: string;

  previousInvoiceHash?: string;

  supplier: Supplier;

  customer?: Customer;

  items: InvoiceItem[];

  totals: InvoiceTotals;
}

export interface CertificateInfo {
  certificate: string;

  publicKey: Uint8Array;

  signatureKey: Uint8Array;

  issuer: string;

  serialNumber: string;

  certDigest: string;
}

export interface SignatureInfo {
  invoiceHash: string;

  signedPropertiesHash: string;

  signatureValue: string;
}

export interface InvoicePipelineResult {
  xml: string;

  hash: string;

  signature: string;

  qrBase64: string;

  uuid?: string;
}
export interface InvoiceXMLInput {
  uuid?: string;
  invoiceNumber: string;
  invoiceDate: string;
  invoiceTime?: string;

  sellerName: string;
  sellerVat: string;

  previousInvoiceHash?: string;
  invoiceCounter?: string;
  totalExclVAT: string;
  totalVAT: string;
  totalInclVAT: string;

  items: {
    name: string;
    quantity: number;
    price: number;
    vatRate?: number;
    unitCode?: string;
  }[];
}
