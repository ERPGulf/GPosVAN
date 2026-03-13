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
  getSerialNumber,
} from './certificate';
import { ZatcaError } from './errors';
import { generateInvoiceHash, generateSignedPropertiesHash } from './hash';
import { buildQRPayload } from './qr';
import { signHash } from './signer';
import { calculateTotals } from './totals';
import type { Invoice, InvoiceResult } from './types';
import { buildInvoiceXML, injectQRData, injectUBLExtensions } from './XMLHelper_dep';
import { savePreviousInvoiceHash } from './zatcaConfig';

/**
 * Full invoice creation pipeline — matches C# CreateInvoice flow:
 * create pem using private public and certficate
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
  /* ── Validate inputs ── */
  if (!invoice.items.length) {
    throw new ZatcaError('validation', 'Invoice must contain at least one item.');
  }
  if (!certificateBase64) {
    throw new ZatcaError('validation', 'Certificate base64 string is required.');
  }
  if (!privateKeyBase64) {
    throw new ZatcaError('validation', 'Private key base64 string is required.');
  }

  try {
    if (__DEV__)
      console.log('[ZATCA] Starting createInvoicePipeline for invoice:', invoice.invoiceNumber);

    /* ── 1. Build base XML ── */
    const baseXml = buildInvoiceXML(invoice);
    if (__DEV__) console.log('[ZATCA] Base XML built.');

    /* ── 2. Hash the base XML ── */
    const invoiceHash = await generateInvoiceHash(baseXml);
    if (__DEV__) {
      console.log('[ZATCA] Invoice Hash (base64):', invoiceHash.base64);
      console.log('[ZATCA] Invoice Hash (hex):', invoiceHash.hex);
    }

    /* ── 3. Certificate info ── */
    const certDigest = await getCertificateDigestValue(certificateBase64);
    const issuerName = getCertificateIssuer(certificateBase64);
    const serialNumber = getSerialNumber(certificateBase64);
    const signingTime = `${invoice.issueDate}T${invoice.issueTime}`;

    if (__DEV__) {
      console.log('[ZATCA] Cert metadata extracted:', { certDigest, issuerName, serialNumber });
    }

    /* ── 4. Signed properties hash ── */
    const signedPropsHash = await generateSignedPropertiesHash(
      signingTime,
      issuerName,
      serialNumber,
      certDigest,
    );
    if (__DEV__) console.log('[ZATCA] Signed Props Hash:', signedPropsHash);

    /* ── 5. Sign the hex hash ── */
    const { derBase64: signatureBase64 } = await signHash(invoiceHash.hex, privateKeyBase64);
    if (__DEV__) console.log('[ZATCA] Signature (base64) generated.');

    /* ── 6. Get clean certificate body for X509Certificate element ── */
    const certificateBody = getCleanCertBody(certificateBase64);

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
    if (__DEV__) console.log('[ZATCA] UBL Extensions injected.');

    /* ── 8. Build QR payload ── */
    const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
    const publicKeyBytes = getPublicKeyBytes(certificateBase64);
    const certSigBytes = getCertificateSignatureBytes(certificateBase64);

    if (__DEV__) {
      console.log('[ZATCA] QR prerequisites ready (PublicKey, CertSignature).');
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
    if (__DEV__) console.log('[ZATCA] QR Payload (base64) built.');

    /* ── 9. Inject QR into XML ── */
    const finalXml = injectQRData(xmlWithExtensions, qrBase64);
    if (__DEV__) console.log('[ZATCA] QR Data injected into XML.');

    /* ── 10. Compute final hash → save as PIH for next invoice ── */
    const finalHash = await generateInvoiceHash(finalXml);
    await savePreviousInvoiceHash(finalHash.base64);
    if (__DEV__) console.log('[ZATCA] Final hash saved as PIH. Pipeline complete.');

    return {
      xml: finalXml,
      hash: invoiceHash.base64,
      signature: signatureBase64,
      qrBase64,
      savedUri: undefined,
    };
  } catch (error) {
    if (__DEV__) console.error('[ZATCA] Pipeline failed:', error);
    if (error instanceof ZatcaError) throw error;
    throw new ZatcaError(
      'pipeline',
      `Invoice pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
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

  if (__DEV__) console.log('Saved invoice XML:', file.uri);

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
