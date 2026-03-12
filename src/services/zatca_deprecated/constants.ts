/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – shared constants                              */
/* ------------------------------------------------------------------ */

/** UBL 2.1 namespace URIs – used by both invoice and credit note XML. */
export const NS = {
  ubl: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  sig: 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
  sac: 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',
  sbc: 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
} as const;

/** Elliptic-curve name used for ZATCA ECDSA signing. */
export const EC_CURVE = 'secp256k1' as const;

/** ZATCA profile ID for Phase 2 reporting. */
export const PROFILE_ID = 'reporting:1.0' as const;

/** Invoice type codes */
export const INVOICE_TYPE = {
  SALES: 388,
  CREDIT_NOTE: 381,
} as const;

/** Invoice subtype for simplified tax invoice */
export const INVOICE_SUBTYPE = '0200000' as const;
