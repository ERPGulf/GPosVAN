/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – shared types                                  */
/* ------------------------------------------------------------------ */

// ───────── Address ─────────
export interface Address {
  street: string;
  buildingNumber: string;
  plotIdentification: string;
  citySubdivision: string;
  city: string;
  postalZone: string;
  countrySubentity: string;
  countryCode: string; // e.g. "SA"
}

// ───────── Supplier / Seller ─────────
export interface SupplierParty {
  registrationName: string; // Company abbreviation / name
  vatNumber: string; // Tax ID (CompanyID)
  companyRegistrationNo: string; // CRN
  address: Address;
}

// ───────── Customer ─────────
export interface CustomerParty {
  registrationName: string;
  vatNumber?: string;
  address?: Address;
}

// ───────── Certificate config ─────────
export interface CertificateConfig {
  /** Base-64 encoded certificate PEM (without BEGIN/END lines) */
  certificateBase64: string;
  /** Base-64 encoded private-key PEM (without BEGIN/END lines) */
  privateKeyBase64: string;
}

// ───────── Invoice item ─────────
export interface InvoiceItem {
  name: string;
  quantity: number;
  /** Unit price (may be tax-inclusive depending on config) */
  price: number;
  /** Tax percentage for this item, e.g. 15 */
  taxPercentage: number;
  /** UOM code, e.g. "PCE" */
  unitOfMeasure: string;
  /** Per-item discount amount (already applied to price) */
  discount?: number;
}

// ───────── Full invoice ─────────
export interface Invoice {
  uuid: string;
  invoiceNumber: string;
  issueDate: string; // yyyy-MM-dd
  issueTime: string; // HH:mm:ss
  timestamp: string; // ISO-8601

  supplier: SupplierParty;
  customer: CustomerParty;

  previousInvoiceHash: string; // PIH – base-64 hash of previous invoice

  items: InvoiceItem[];

  /** Document-level discount amount */
  discount: number;

  currency: string; // e.g. "SAR"

  /** Whether item prices already include tax */
  isTaxIncludedInPrice: boolean;

  /** Invoice subtype code: '0100000' = Standard, '0200000' = Simplified. Defaults to INVOICE_SUBTYPE constant. */
  invoiceSubtype?: string;
}

// ───────── Computed totals ─────────
export interface InvoiceTotals {
  /** Sum of line extension amounts (price × qty, tax-exclusive) */
  subtotal: number;
  /** Total VAT amount */
  totalTax: number;
  /** subtotal + totalTax */
  totalWithTax: number;
  /** totalWithTax − discount */
  payableAmount: number;
  /** Tax exclusive amount after applying document-level discounts */
  taxableAmount: number;
}

// ───────── Sales Return / Credit Note ─────────
export interface SalesReturnInvoice extends Invoice {
  /** ID of the original invoice being returned / credited */
  billingReferenceId: string;
}

// ───────── Pipeline result ─────────
export interface InvoiceResult {
  xml: string;
  hash: string; // base-64 invoice hash
  signature: string; // base-64 signature
  qrBase64: string; // base-64 QR TLV payload
  savedUri?: string; // local URI path where XML is saved
}
