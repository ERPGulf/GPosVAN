/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – shared types                                  */
/* ------------------------------------------------------------------ */

// ───────── Address ─────────
export interface Address {
  readonly street: string;
  readonly buildingNumber: string;
  readonly plotIdentification: string;
  readonly citySubdivision: string;
  readonly city: string;
  readonly postalZone: string;
  readonly countrySubentity: string;
  readonly countryCode: string; // e.g. "SA"
}

// ───────── Supplier / Seller ─────────
export interface SupplierParty {
  readonly registrationName: string; // Company abbreviation / name
  readonly vatNumber: string; // Tax ID (CompanyID)
  readonly companyRegistrationNo: string; // CRN
  readonly address: Address;
}

// ───────── Customer ─────────
export interface CustomerParty {
  readonly registrationName: string;
  readonly vatNumber?: string;
  readonly address?: Address;
}

// ───────── Certificate config ─────────
export interface CertificateConfig {
  /** Base-64 encoded certificate PEM (without BEGIN/END lines) */
  readonly certificateBase64: string;
  /** Base-64 encoded private-key PEM (without BEGIN/END lines) */
  readonly privateKeyBase64: string;
}

// ───────── Invoice item ─────────
export interface InvoiceItem {
  readonly name: string;
  readonly quantity: number;
  /** Unit price (may be tax-inclusive depending on config) */
  readonly price: number;
  /** Tax percentage for this item, e.g. 15 */
  readonly taxPercentage: number;
  /** UOM code, e.g. "PCE" */
  readonly unitOfMeasure: string;
  /** Per-item discount amount (already applied to price) */
  readonly discount?: number;
}

// ───────── Full invoice ─────────
export interface Invoice {
  readonly uuid: string;
  readonly invoiceNumber: string;
  readonly issueDate: string; // yyyy-MM-dd
  readonly issueTime: string; // HH:mm:ss
  readonly timestamp: string; // ISO-8601

  readonly supplier: SupplierParty;
  readonly customer: CustomerParty;

  readonly previousInvoiceHash: string; // PIH – base-64 hash of previous invoice

  readonly items: readonly InvoiceItem[];

  /** Document-level discount amount */
  readonly discount: number;

  readonly currency: string; // e.g. "SAR"

  /** Whether item prices already include tax */
  readonly isTaxIncludedInPrice: boolean;

  /** Invoice subtype code: '0100000' = Standard, '0200000' = Simplified. Defaults to INVOICE_SUBTYPE constant. */
  readonly invoiceSubtype?: string;
}

// ───────── Computed totals ─────────
export interface InvoiceTotals {
  /** Sum of line extension amounts (price × qty, tax-exclusive) */
  readonly subtotal: number;
  /** Total VAT amount */
  readonly totalTax: number;
  /** subtotal + totalTax */
  readonly totalWithTax: number;
  /** totalWithTax − discount */
  readonly payableAmount: number;
  /** Tax exclusive amount after applying document-level discounts */
  readonly taxableAmount: number;
}

// ───────── Sales Return / Credit Note ─────────
export interface SalesReturnInvoice extends Invoice {
  /** ID of the original invoice being returned / credited */
  readonly billingReferenceId: string;
}

// ───────── Pipeline result ─────────
export interface InvoiceResult {
  readonly xml: string;
  readonly hash: string; // base-64 invoice hash
  readonly signature: string; // base-64 signature
  readonly qrBase64: string; // base-64 QR TLV payload
  readonly savedUri?: string; // local URI path where XML is saved
}
