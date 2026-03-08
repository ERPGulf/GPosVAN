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
    /* ── 1. Build base XML ── */
    const baseXml = buildSalesReturnXML(invoice);

    /* ── 2. Hash the base XML ── */
    const invoiceHash = await generateInvoiceHash(baseXml);

    /* ── 3. Certificate info ── */
    const certDigest = await getCertificateDigestValue(certificateBase64);
    const issuerName = getCertificateIssuer(certificateBase64);
    const serialNumber = getSerialNumber(certificateBase64);
    const signingTime = `${invoice.issueDate}T${invoice.issueTime}`;

    /* ── 4. Signed properties hash ── */
    const signedPropsHash = await generateSignedPropertiesHash(
      signingTime,
      issuerName,
      serialNumber,
      certDigest,
    );

    /* ── 5. Sign the hex hash ── */
    const { derBase64: signatureBase64 } = await signHash(invoiceHash.hex, privateKeyBase64);

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

    /* ── 8. Build QR payload ── */
    const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
    const publicKeyBytes = getPublicKeyBytes(certificateBase64);
    const certSigBytes = getCertificateSignatureBytes(certificateBase64);

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

    /* ── 9. Inject QR into XML ── */
    const finalXml = injectSalesReturnQRData(xmlWithExtensions, qrBase64);

    /* ── 10. Compute final hash → save as PIH for next invoice ── */
    const finalHash = await generateInvoiceHash(finalXml);
    await savePreviousInvoiceHash(finalHash.base64);

    return {
      xml: finalXml,
      hash: invoiceHash.base64,
      signature: signatureBase64,
      qrBase64,
      savedUri: undefined,
    };
  } catch (error) {
    if (error instanceof ZatcaError) throw error;
    throw new ZatcaError(
      'pipeline',
      `Credit note pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}
