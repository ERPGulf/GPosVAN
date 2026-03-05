/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – invoice creation pipeline                     */
/*                                                                    */
/* ------------------------------------------------------------------ */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  bytesToBase64,
  decodeCertificate,
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
  console.log('Invoice Hash:', invoiceHash.base64);
  console.log('Canonical XML:', invoiceHash.canonicalXml);

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
  const certificateBody = bytesToBase64(decodeCertificate(certificateBase64));

  /* ── 6. Get certificate body for XML ── */
  // const certificateBody = certificateBase64
  //   .replace(/-----BEGIN CERTIFICATE-----/g, '')
  //   .replace(/-----END CERTIFICATE-----/g, '')
  //   .replace(/\s+/g, '');
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
  // const PUBLICKEY =
  //   'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUZZd0VBWUhLb1pJemowQ0FRWUZLNEVFQUFvRFFnQUVnT0xiQzNSWWlnZUJFSG5aYTBWMVFTMmk2VW03SURLdQpEa3JFb1VYNGlVekMxalRJNjA4dnM5NkdPekFrQmd3UGRZQXoxNnNnVVVLRlBUR3phZCtZR1E9PQotLS0tLUVORCBQVUJMSUMgS0VZLS0tLS0=';
  // const CERTSIGNER =
  //   'TUlJQ09EQ0NBZDZnQXdJQkFnSUdBWmhDcHo5Y01Bb0dDQ3FHU000OUJBTUNNQlV4RXpBUkJnTlZCQU1NQ21WSmJuWnZhV05wYm1jd0hoY05NalV3TnpJMU1UY3pOVEE0V2hjTk16QXdOekkwTWpFd01EQXdXakJ5TVFzd0NRWURWUVFHRXdKVFFURVlNQllHQTFVRUN3d1BNekV5TkRFNU1UY3dNVEF3TURBek1TRXdId1lEVlFRS0RCaEtZWGRoWkNCQmJHUnBZV1poSUZSeVlXUnBibWNnUTI4eEpqQWtCZ05WQkFNTUhWUlRWQzA0T0RZME16RXhORFV0TXpFeU5ERTVNVGN3TVRBd01EQXpNRll3RUFZSEtvWkl6ajBDQVFZRks0RUVBQW9EUWdBRW56VVI3V1BTTVhQSGpGUElNcVpWTjlDQ1AyN2FmazZyaTlhUDVONUFKNkR1MUNBbTU4RWk2WnFFamEwelljZW9nL1JEWjlNZWRYS2FvN1JwUS9WZlc2T0J2ekNCdkRBTUJnTlZIUk1CQWY4RUFqQUFNSUdyQmdOVkhSRUVnYU13Z2FDa2daMHdnWm94TnpBMUJnTlZCQVFNTGpFdFZGTlVmREl0VkZOVWZETXRNak0yT1RBNE5qZ3RNR1JsTXkxbU9EazNMVFZqWldVdFl6RmxZbVJsTURZeEh6QWRCZ29Ka2lhSmsvSXNaQUVCREE4ek1USTBNVGt4TnpBeE1EQXdNRE14RFRBTEJnTlZCQXdNQkRFeE1EQXhEekFOQmdOVkJCb01Ca3BsWkdSaGFERWVNQndHQTFVRUR3d1ZVbVZoYkNCbGMzUmhkR1VnWVdOMGFYWnBkR1Z6TUFvR0NDcUdTTTQ5QkFNQ0EwZ0FNRVVDSUV4TXZwMGVmV3NYUWFQYjEybklPYlNHdEtLRk8vdFVYcU1NWU85L1dhRURBaUVBMlBzNjkrTTZuWWVJV25JT0lHZGxIZFplTjJsMVk1K1ZnK0J2YnY5MkcvOD0=';
  // const publicKeyBytes = getPublicKeyBytesFromPem(PUBLICKEY);
  // const certSigBytes = getCertificateSignatureBytes(CERTSIGNER);
  /* ── 8. Build QR payload ── */

  const publicKeyBytes = getPublicKeyBytes(certificateBase64);
  const certSigBytes = getCertificateSignatureBytes(certificateBase64);

  // 🔍 DEBUG CHECK
  console.log('Signature length:', signatureRawBytes.length);
  console.log('PublicKey length:', publicKeyBytes.length);
  console.log(
    'PublicKey hex:',
    Array.from(publicKeyBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  );
  console.log('CertSignature length:', certSigBytes.length);

  const qrBase64 = buildQRPayload({
    sellerName: invoice.supplier.registrationName,
    vatNumber: invoice.supplier.vatNumber,
    timestamp: signingTime,
    total: totals.totalWithTax.toFixed(2),
    vat: totals.totalTax.toFixed(2),
    hash: invoiceHash.base64,
    signature: signatureRawBytes,
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

  const dirInfo = dir.info();
  if (!dirInfo.exists) {
    dir.create({ intermediates: true });
  }

  const file = new File(dir, `Invoice_${invoiceNumber}_${Date.now()}.xml`);

  const fileInfo = file.info();
  if (fileInfo.exists) {
    file.delete();
  }

  file.write(xmlContent);

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
