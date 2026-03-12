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
import {
    buildSalesReturnXML,
    injectSalesReturnQRData,
    injectSalesReturnUBLExtensions,
} from './salesReturnBuilder';
import { signHash } from './signer';
import { calculateTotals } from './totals';
import type { InvoiceResult, SalesReturnInvoice } from './types';
import { savePreviousInvoiceHash } from './zatcaConfig';
import { serializeXML, canonicalizeDOM } from './XMLHelper';

export async function createSalesReturnPipeline(
  invoice: SalesReturnInvoice,
  certificateBase64: string,
  privateKeyBase64: string,
): Promise<InvoiceResult> {
  if (!invoice.items.length) {
    throw new ZatcaError('validation', 'Credit note must contain at least one item.');
  }
  if (!invoice.billingReferenceId) {
    throw new ZatcaError('validation', 'Billing reference ID is required for credit notes.');
  }

  try {
    const baseXmlDoc = buildSalesReturnXML(invoice);
    const canonicalXml = canonicalizeDOM(baseXmlDoc);

    const invoiceHashBuf = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalXml, { encoding: Crypto.CryptoEncoding.HEX });
    const invoiceHashBase64 = Buffer.from(invoiceHashBuf, 'hex').toString('base64');
    
    const certDigest = await getCertificateDigestValue(certificateBase64);
    const issuerName = getCertificateIssuer(certificateBase64).replace(/\r?\n/g, ", ");
    const serialNumber = getSerialNumber(certificateBase64);
    const signingTime = `${invoice.issueDate}T${invoice.issueTime}`;

    const signedPropsHash = await generateSignedPropertiesHash(
      signingTime,
      issuerName,
      serialNumber,
      certDigest,
    );

    const { derBase64: signatureBase64 } = await signHash(invoiceHashBuf, privateKeyBase64);
    const certificateBody = getCleanCertBody(certificateBase64);

    injectSalesReturnUBLExtensions(
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

    const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
    const publicKeyBytes = getPublicKeyBytes(certificateBase64);
    const certSigBytes = getCertificateSignatureBytes(certificateBase64);

    const qrBase64 = buildQRPayload({
      sellerName: invoice.supplier.registrationName,
      vatNumber: invoice.supplier.vatNumber,
      timestamp: signingTime,
      total: totals.totalWithTax.toFixed(2),
      vat: totals.totalTax.toFixed(2),
      hash: invoiceHashBase64,
      signatureBase64: signatureBase64,
      publicKeyBytes,
      certSignatureBytes: certSigBytes,
    });

    injectSalesReturnQRData(baseXmlDoc, qrBase64);
    const finalXml = serializeXML(baseXmlDoc);

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
      `Credit note pipeline failed: ${error instanceof Error ? error.message : String(error)}`,
      error,
    );
  }
}
