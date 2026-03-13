/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – public API barrel exports                     */
/* ------------------------------------------------------------------ */

// ── Pipelines ──
export { createInvoicePipeline, saveInvoiceXML, shareInvoiceXML } from './invoicePipeline';
export { createSalesReturnPipeline } from './salesReturnPipeline';

// ── XML Builders (for advanced / custom usage) ──
export {
  buildSalesReturnXML,
  injectSalesReturnQRData,
  injectSalesReturnUBLExtensions,
} from './salesReturnBuilder';
export { buildInvoiceXML, injectQRData, injectUBLExtensions } from './XMLHelper_dep';

// ── QR ──
export { buildQRPayload } from './qr';
export type { QRPayloadInput } from './qr';

// ── Certificate utilities ──
export {
  getCertificateDigestValue,
  getCertificateIssuer,
  getCertificateSignatureBytes,
  getCleanCertBody,
  getPublicKeyBytes,
  getSerialNumber,
} from './certificate';

// ── Hashing ──
export { generateInvoiceHash, generateSignedPropertiesHash } from './hash';

// ── Signing ──
export { signHash } from './signer';

// ── Totals ──
export { calculateItemAmounts, calculateTotals } from './totals';

// ── Errors ──
export { ZatcaError } from './errors';

// ── Types ──
export type {
  Address,
  CertificateConfig,
  CustomerParty,
  Invoice,
  InvoiceItem,
  InvoiceResult,
  InvoiceTotals,
  SalesReturnInvoice,
  SupplierParty,
} from './types';

// ── Config / PIH storage ──
export {
  certificate,
  getPreviousInvoiceHash,
  isTaxIncludedInPrice,
  savePreviousInvoiceHash,
  supplier,
} from './zatcaConfig';

// ── Utilities ──
export { generateSimpleQrString, getZatcaVersion } from './zatcaUtils';

// ── Constants ──
export { EC_CURVE, INVOICE_SUBTYPE, INVOICE_TYPE, NS, PROFILE_ID } from './constants';
