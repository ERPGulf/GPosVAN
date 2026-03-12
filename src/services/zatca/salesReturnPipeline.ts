/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – credit note (sales return) creation pipeline  */
/*                                                                    */
/*  Mirrors invoicePipeline.ts but uses the sales return XML builder. */
/* ------------------------------------------------------------------ */
import {
    getCertificateDigestValue,
    getCertificateIssuer,
    getCertificateSignatureBytes,
    getCleanCertBody,
    getPublicKeyBytes,
    getSerialNumber,
} from './certificate';
import { ZatcaError } from './errors';
import { generateInvoiceHash, generateSignedPropertiesHash } from './hash';
import { buildQRPayload } from './qr';
import {
    buildSalesReturnXML,
    injectSalesReturnQRData,
    injectSalesReturnUBLExtensions,
} from './salesReturnBuilder';
import { signHash } from './signer';
import { calculateTotals } from './totals';
import type { InvoiceResult, SalesReturnInvoice } from './types';
import { savePreviousInvoiceHash } from './zatcaConfig';

/**
 * Full credit-note creation pipeline — same steps as the invoice
 * pipeline but using InvoiceTypeCode 381 and BillingReference.
 *
 * 1. Build base credit note XML
 * 2. Hash base XML → { hex, base64 }
 * 3. Get certificate info (digest, issuer, serial)
 * 4. Generate signed properties hash
 * 5. Sign hex hash
 * 6. Inject UBL extensions with signature
 * 7. Build QR TLV payload
 * 8. Inject QR into XML
 * 9. Compute final hash → save as PIH
 */
export async function createSalesReturnPipeline(
  invoice: SalesReturnInvoice,
  certificateBase64: string,
  privateKeyBase64: string,
): Promise<InvoiceResult> {
  /* ── Validate inputs ── */
  if (!invoice.items.length) {
    throw new ZatcaError('validation', 'Credit note must contain at least one item.');
  }
  if (!certificateBase64) {
    throw new ZatcaError('validation', 'Certificate base64 string is required.');
  }
  if (!privateKeyBase64) {
    throw new ZatcaError('validation', 'Private key base64 string is required.');
  }
  if (!invoice.billingReferenceId) {
    throw new ZatcaError('validation', 'Billing reference ID is required for credit notes.');
  }

  try {
    if (__DEV__) console.log('[ZATCA] Starting createSalesReturnPipeline for invoice:', invoice.invoiceNumber);

    /* ── 1. Build base XML ── */
    const baseXml = buildSalesReturnXML(invoice);
    if (__DEV__) console.log('[ZATCA] Sales Return Base XML built.');

    /* ── 2. Hash the base XML ── */
    const invoiceHash = await generateInvoiceHash(baseXml);
    if (__DEV__) {
      console.log('[ZATCA] Sales Return Hash (base64):', invoiceHash.base64);
      console.log('[ZATCA] Sales Return Hash (hex):', invoiceHash.hex);
    }

    /* ── 3. Certificate info ── */
    const certDigest = await getCertificateDigestValue(certificateBase64);
    const issuerName = getCertificateIssuer(certificateBase64);
    const serialNumber = getSerialNumber(certificateBase64);
    const signingTime = `${invoice.issueDate}T${invoice.issueTime}`;

    if (__DEV__) {
      console.log('[ZATCA] Cert metadata extracted for Sales Return:', { certDigest, issuerName, serialNumber });
    }

    /* ── 4. Signed properties hash ── */
    const signedPropsHash = await generateSignedPropertiesHash(
      signingTime,
      issuerName,
      serialNumber,
      certDigest,
    );
    if (__DEV__) console.log('[ZATCA] Sales Return Signed Props Hash:', signedPropsHash);

    /* ── 5. Sign the hex hash ── */
    const { derBase64: signatureBase64 } = await signHash(invoiceHash.hex, privateKeyBase64);
    if (__DEV__) console.log('[ZATCA] Sales Return Signature (base64) generated.');

    /* ── 6. Get clean certificate body ── */
    const certificateBody = getCleanCertBody(certificateBase64);

    /* ── 7. Inject UBL extensions ── */
    const xmlWithExtensions = injectSalesReturnUBLExtensions(
      baseXml,
      invoiceHash.base64,
      signedPropsHash,
      signatureBase64,
      certificateBody,
      signingTime,
      certDigest,
      issuerName,
      serialNumber,
    );
    if (__DEV__) console.log('[ZATCA] Sales Return UBL Extensions injected.');

    /* ── 8. Build QR payload ── */
    const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
    const publicKeyBytes = getPublicKeyBytes(certificateBase64);
    const certSigBytes = getCertificateSignatureBytes(certificateBase64);

    if (__DEV__) {
      console.log('[ZATCA] Sales Return QR prerequisites ready.');
    }

    const qrBase64 = buildQRPayload({
      sellerName: invoice.supplier.registrationName,
      vatNumber: invoice.supplier.vatNumber,
      timestamp: signingTime,
      total: totals.totalWithTax.toFixed(2),
      vat: totals.totalTax.toFixed(2),
      hash: invoiceHash.base64,
      signatureBase64: signatureBase64,
      publicKeyBytes,
      certSignatureBytes: certSigBytes,
    });
    if (__DEV__) console.log('[ZATCA] Sales Return QR Payload built.');

    /* ── 9. Inject QR into XML ── */
    const finalXml = injectSalesReturnQRData(xmlWithExtensions, qrBase64);
    if (__DEV__) console.log('[ZATCA] Sales Return QR Data injected.');

    /* ── 10. Compute final hash → save as PIH for next invoice ── */
    const finalHash = await generateInvoiceHash(finalXml);
    await savePreviousInvoiceHash(finalHash.base64);
    if (__DEV__) console.log('[ZATCA] Sales Return Final hash saved as PIH. Pipeline complete.');

    return {
      xml: finalXml,
      hash: invoiceHash.base64,
      signature: signatureBase64,
      qrBase64,
      savedUri: undefined,
    };
  } catch (error) {
    if (__DEV__) console.error('[ZATCA] Sales Return pipeline failed:', error);
    if (error instanceof ZatcaError) throw error;
    throw new ZatcaError(
      'pipeline',
      `Credit note pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}
