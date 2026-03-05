/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – invoice creation pipeline                     */
/*                                                                    */
/*  Replicates C# XMLHelper.CreateInvoice flow exactly.               */
/* ------------------------------------------------------------------ */
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import {
  getCertificateDigestValue,
  getCertificateIssuer,
  getCertificateSignatureBytes,
  getCleanCertBody,
  getPublicKeyBytes,
  getSerialNumber
} from './certificate';
import { generateInvoiceHash, generateSignedPropertiesHash } from './hash';
import { buildQRPayload } from './qr';
import { signHash } from './signer';
import { calculateTotals } from './totals';
import type { Invoice, InvoiceResult } from './types';
import { buildInvoiceXML, injectQRData, injectUBLExtensions } from './XMLHelper';
import { savePreviousInvoiceHash } from './zatcaConfig';

/**
 * Full invoice creation pipeline — matches C# CreateInvoice flow:
 *
 * 1. Build base XML
 * 2. Hash base XML → { hex, base64 }
 * 3. Get certificate info (digest, issuer, serial)
 * 4. Generate signed properties hash
 * 5. Sign hex hash (C#: SignHashWithECDSABytes(invoiceHash.Item1))
 * 6. Inject UBL extensions with signature
 * 7. Build QR TLV payload
 * 8. Inject QR into XML
 * 9. Compute final hash → save as PIH
 */
export async function createInvoicePipeline(
  invoice: Invoice,
  certificateBase64: string,
  privateKeyBase64: string,
): Promise<InvoiceResult> {
  /* ── 1. Build base XML ── */
  const baseXml = buildInvoiceXML(invoice);

  /* ── 2. Hash the base XML ── */
  // C#: var invoiceHash = GetInvoiceHash(canonicalXml);
  //   invoiceHash.Item1 = hex, invoiceHash.Item2 = base64
  const invoiceHash = await generateInvoiceHash(baseXml);
  console.log('Invoice Hash (base64):', invoiceHash.base64);
  console.log('Invoice Hash (hex):', invoiceHash.hex);

  /* ── 3. Certificate info ── */
  // C#: CertificateUtils.getDigestValue(), .GetCertificateIssuer(), .GetSerialNumber()
  const certDigest = await getCertificateDigestValue(certificateBase64);
  const issuerName = getCertificateIssuer(certificateBase64);
  const serialNumber = getSerialNumber(certificateBase64);
  const signingTime = `${invoice.issueDate}T${invoice.issueTime}`;

  console.log('Cert Digest:', certDigest);
  console.log('Issuer Name:', issuerName);
  console.log('Serial Number:', serialNumber);

  /* ── 4. Signed properties hash ── */
  // C#: GenerateSignedPropertiesHash(signingTime, issuer, serial, certDigest)
  const signedPropsHash = await generateSignedPropertiesHash(
    signingTime,
    issuerName,
    serialNumber,
    certDigest,
  );
  console.log('Signed Props Hash:', signedPropsHash);

  /* ── 5. Sign the hex hash ── */
  // C#: var invoiceSignature = CertificateUtils.SignHashWithECDSABytes(invoiceHash.Item1);
  // Item1 = hex hash
  const { derBase64: signatureBase64, rawBytes: signatureRawBytes } = await signHash(
    invoiceHash.hex,
    privateKeyBase64,
  );
  console.log('Signature (base64):', signatureBase64);

  /* ── 6. Get clean certificate body for X509Certificate element ── */
  // C#: Encoding.UTF8.GetString(Convert.FromBase64String(Certificate))
  const certificateBody = getCleanCertBody(certificateBase64);

  /* ── 7. Inject UBL extensions ── */
  // C#: CreateUBLExtension(..., invoiceHash.Item2, signInfoHash, Convert.ToBase64String(sig))
  // SignatureValue = Convert.ToBase64String(invoiceSignature)
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
  // C#: QRUtils.GetQRString(hashBase64, ..., invoiceSignature)
  const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
  const publicKeyBytes = getPublicKeyBytes(certificateBase64);
  const certSigBytes = getCertificateSignatureBytes(certificateBase64);

  console.log('PublicKey length:', publicKeyBytes.length);
  console.log('CertSignature length:', certSigBytes.length);

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
