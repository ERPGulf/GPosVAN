/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – invoice creation pipeline                     */
/*                                                                    */
/* ------------------------------------------------------------------ */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  base64ToBytes,
  getCertificateDigestValue,
  getCertificateIssuer,
  getCertificateSignatureBytes,
  getPublicKeyBytes,
  getSerialNumber,
} from './certificate';
import { generateInvoiceHash, generateSignedPropertiesHash } from './hash';
import { buildQRPayload } from './qr';
import { signHash } from './signer';
import { calculateTotals } from './totals';
import type { Invoice, InvoiceResult } from './types';
import { buildInvoiceXML, injectQRData, injectUBLExtensions } from './XMLHelper';
import { savePreviousInvoiceHash } from './zatcaConfig';

/**
 * Full invoice creation pipeline.
 *
 * 1. Build base XML (without UBL extensions)
 * 2. Hash the base XML
 * 3. Sign the hash
 * 4. Build signed-properties hash
 * 5. Inject UBL extensions (signature block) into XML
 * 6. Build QR TLV payload
 * 7. Inject QR into XML
 * 8. Compute final invoice hash and save as PIH for next invoice
 */
export async function createInvoicePipeline(
  invoice: Invoice,
  certificateBase64: string,
  privateKeyBase64: string,
): Promise<InvoiceResult> {
  /* ── 1. Build base XML ── */
  const baseXml = buildInvoiceXML(invoice);

  /* ── 2. Hash the base XML ── */
  const invoiceHash = await generateInvoiceHash(baseXml);

  /* ── 3. Sign the hash ── */
  const { derBase64: signatureBase64, rawBytes: signatureRawBytes } = signHash(
    invoiceHash.hex,
    privateKeyBase64,
  );

  /* ── 4. Certificate info for signed properties ── */
  const certDigest = await getCertificateDigestValue(certificateBase64);
  const issuerName = getCertificateIssuer(certificateBase64);
  const serialNumber = getSerialNumber(certificateBase64);
  const signingTime = `${invoice.issueDate}T${invoice.issueTime}`;

  /* ── 5. Signed properties hash ── */
  const signedPropsHash = await generateSignedPropertiesHash(
    signingTime,
    issuerName,
    serialNumber,
    certDigest,
  );

  /* ── 6. Get the raw certificate body (for X509Certificate element) ── */
  // The certificate might be double-base64 encoded (like in C#), decode once
  let certificateBody: string;
  try {
    const decoded = new TextDecoder().decode(base64ToBytes(certificateBase64));
    // If decoded result looks like base-64, use it directly; otherwise use original
    certificateBody = /^[A-Za-z0-9+/=\s]+$/.test(decoded.trim())
      ? decoded.trim()
      : certificateBase64;
  } catch {
    certificateBody = certificateBase64;
  }

  /* ── 7. Inject UBL extensions ── */
  const xmlWithExtensions = injectUBLExtensions(
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
    signature: signatureBase64,
    publicKeyBytes,
    certSignatureBytes: certSigBytes,
  });

  /* ── 9. Inject QR into XML ── */
  const finalXml = injectQRData(xmlWithExtensions, qrBase64);

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
}

/**
 * Utility to save the generated XML to the device's Document folder
 * and optionally prompt the user to share/save it.
 */
export async function saveInvoiceXML(invoiceNumber: string, xmlContent: string) {
  const dir = new Directory(Paths.document, 'zatca_invoices');
  await dir.create({ intermediates: true });

  const file = new File(dir, `Invoice_${invoiceNumber}.xml`);

  await file.write(xmlContent);

  console.log('Saved invoice XML:', file.uri);

  return file.uri;
}

/**
 * Utility to trigger the native share dialog for the saved XML file
 */
export async function shareInvoiceXML(fileUri: string) {
  try {
    const isAvailable = await Sharing.isAvailableAsync();
    if (isAvailable) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/xml',
        dialogTitle: 'Share ZATCA Invoice',
      });
    } else {
      console.warn('Sharing is not available on this device');
    }
  } catch (error) {
    console.error('Error sharing invoice XML:', error);
  }
}
