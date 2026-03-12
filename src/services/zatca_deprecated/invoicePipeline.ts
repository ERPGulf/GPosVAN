import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as Crypto from 'expo-crypto';
import { Buffer } from 'buffer';

import {
    getCertificateDigestValue,
    getCertificateIssuer,
    getCertificateSignatureBytes,
    getCleanCertBody,
    getPublicKeyBytes,
    getSerialNumber,
} from './certificate';
import { ZatcaError } from './errors';
import { generateSignedPropertiesHash } from './hash';
import { buildQRPayload } from './qr';
import { signHash } from './signer';
import { calculateTotals } from './totals';
import type { Invoice, InvoiceResult } from './types';
import { buildInvoiceXML, injectQRData, injectUBLExtensions, serializeXML, canonicalizeDOM } from './XMLHelper';
import { savePreviousInvoiceHash } from './zatcaConfig';

export async function createInvoicePipeline(
  invoice: Invoice,
  certificateBase64: string,
  privateKeyBase64: string,
): Promise<InvoiceResult> {
  if (!invoice.items.length) {
    throw new ZatcaError('validation', 'Invoice must contain at least one item.');
  }

  try {
    /* ── 1. Build base XML ── */
    const baseXmlDoc = buildInvoiceXML(invoice);

    /* ── 2. Canonicalize XML & hash ── */
    const canonicalXml = canonicalizeDOM(baseXmlDoc);
    
    // Create base64 and hex representation of the invoice hash
    const invoiceHashBuf = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalXml, { encoding: Crypto.CryptoEncoding.HEX });
    const invoiceHashBase64 = Buffer.from(invoiceHashBuf, 'hex').toString('base64');
    
    /* ── 3. Certificate info ── */
    const certDigest = await getCertificateDigestValue(certificateBase64);
    
    // Explicitly replace line feeds for exact hashing
    const issuerName = getCertificateIssuer(certificateBase64).replace(/\r?\n/g, ", ");
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
    // Passes hex string of hash directly, matches Node.js crypto.sign
    const { derBase64: signatureBase64 } = await signHash(invoiceHashBuf, privateKeyBase64);

    /* ── 6. Inject UBL extensions ── */
    const certificateBody = getCleanCertBody(certificateBase64);
    
    // Mutates the live DOM Document
    injectUBLExtensions(
      baseXmlDoc,
      invoiceHashBase64,
      signedPropsHash,
      signatureBase64,
      certificateBody,
      signingTime,
      certDigest,
      issuerName,
      serialNumber,
    );

    /* ── 7. Build QR payload ── */
    const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
    
    // ZATCA exact QR Buffers
    const publicKeyBytes = getPublicKeyBytes(certificateBase64);
    // Certificate signature raw buffer
    const certSigBytes = getCertificateSignatureBytes(certificateBase64);

    const qrBase64 = buildQRPayload({
      sellerName: invoice.supplier.registrationName,
      vatNumber: invoice.supplier.vatNumber,
      timestamp: signingTime, // Tag 3 String ISO
      total: totals.totalWithTax.toFixed(2), // Tag 4 Decimal String
      vat: totals.totalTax.toFixed(2), // Tag 5 Decimal string
      hash: invoiceHashBase64, // Tag 6 Base64 hash encoded as text bytes
      signatureBase64: signatureBase64, // Tag 7 Base64 signature encoded as text bytes 
      publicKeyBytes, // Tag 8 Raw PublicKey Info Buffer
      certSignatureBytes: certSigBytes, // Tag 9 Raw Certificate Signature Buffer
    });

    /* ── 8. Inject QR into XML ── */
    injectQRData(baseXmlDoc, qrBase64);
    
    // After appending Extensions and QA, we serialize the XML 
    const finalXml = serializeXML(baseXmlDoc);

    /* ── 9. Compute final hash → save as PIH for next invoice ── */
    const finalCanonical = canonicalizeDOM(baseXmlDoc);
    const finalHashBuf = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, finalCanonical, { encoding: Crypto.CryptoEncoding.BASE64 });
    await savePreviousInvoiceHash(finalHashBuf);

    return {
      xml: finalXml,
      hash: invoiceHashBase64,
      signature: signatureBase64,
      qrBase64,
      savedUri: undefined,
    };
  } catch (error) {
    if (error instanceof ZatcaError) throw error;
    throw new ZatcaError(
      'pipeline',
      `Invoice pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}

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
  return file.uri;
}

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
