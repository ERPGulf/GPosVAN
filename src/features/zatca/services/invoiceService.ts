/**
 * ZATCA Invoice Service — main orchestrator.
 *
 * Ports the C# XMLHelper.CreateInvoice flow:
 * 1. Build base XML (without UBLExtension)
 * 2. Canonicalize (remove tags + C14N) → compute invoice hash
 * 3. Compute signed properties hash
 * 4. Sign the invoice hash with ECDSA
 * 5. Insert UBLExtension with signature into XML
 * 6. Insert signed properties ds:Object
 * 7. Compute QR data (TLV)
 * 8. Update QR placeholder in XML
 * 9. Compute final canonical hash for PIH
 */
import type { InvoiceParams, InvoiceResult, ZatcaConfig } from '../types';
import { getCertificateInfo, getDigestValue, signHashWithECDSA } from './certificateUtils';
import {
  canonicalizeXml,
  computeHashBase64,
  generateInvoiceHash,
  generateSignedPropertiesHash,
} from './hashUtils';
import { getQRString } from './qrUtils';
import {
  buildBaseInvoiceXml,
  buildSignedPropertiesObject,
  buildUBLExtension,
  insertSignedPropertiesObject,
  insertUBLExtension,
  updateQRData,
} from './xmlBuilder';

function formatDateTime(d: Date): string {
  const date = d.toISOString().split('T')[0];
  const time = d.toTimeString().split(' ')[0];
  return `${date}T${time}`;
}

function decodeCertificateContent(base64Cert: string): string {
  return atob(base64Cert);
}

function decodePrivateKey(base64Key: string): string {
  return atob(base64Key);
}

function buildCertificatePem(certContent: string): string {
  let pem = '-----BEGIN CERTIFICATE-----\n';
  for (let i = 0; i < certContent.length; i += 64) {
    pem += certContent.substring(i, Math.min(i + 64, certContent.length)) + '\n';
  }
  pem += '-----END CERTIFICATE-----';
  return pem;
}

export function createInvoice(params: InvoiceParams, config: ZatcaConfig): InvoiceResult {
  const invoiceUUID = params.invoiceUUID;

  // Decode certificate and keys from base64 config
  const certificateContent = decodeCertificateContent(config.certificate);
  const privateKeyPem = decodePrivateKey(config.privateKey);
  const certPem = buildCertificatePem(certificateContent);

  // Compute totals (matching C# logic)
  const cartItems = params.cartItems;
  let totalExcludeTax = 0;
  for (const item of cartItems) {
    const itemPrice = item.product.uomPrice ?? item.product.price ?? 0;
    if (config.isTaxIncludedInPrice) {
      const priceWithoutTax = itemPrice / (1 + (item.product.taxPercentage ?? 15) / 100);
      totalExcludeTax += priceWithoutTax * item.quantity;
    } else {
      totalExcludeTax += itemPrice * item.quantity;
    }
  }

  // Step 1: Build base XML
  const baseXml = buildBaseInvoiceXml({
    invoiceNumber: params.invoiceNumber,
    invoiceDate: params.invoiceDate,
    uuid: invoiceUUID,
    invoiceTypeCode: params.invoiceTypeCode,
    invoiceSubType: params.invoiceSubType,
    previousInvoiceHash: params.previousInvoiceHash,
    customer: params.customer,
    cartItems,
    tax: params.tax,
    totalExcludeTax,
    discount: params.discount,
    config,
  });

  // Step 2: Compute invoice hash (remove tags + C14N + SHA-256)
  const invoiceHash = generateInvoiceHash(baseXml);

  // Step 3: Get certificate info and compute certificate digest
  const certInfo = getCertificateInfo(certPem);
  const certificateDigestValue = getDigestValue(certificateContent);

  // Step 4: Compute signed properties hash
  const signingTime = formatDateTime(params.invoiceDate);
  const signedPropertiesHash = generateSignedPropertiesHash(
    signingTime,
    certInfo.issuer,
    certInfo.serialNumber,
    certificateDigestValue,
  );

  // Step 5: Sign the invoice hash with ECDSA
  const signatureResult = signHashWithECDSA(invoiceHash.hex, privateKeyPem);

  // Step 6: Build and insert UBLExtension
  const ublExtension = buildUBLExtension(
    invoiceHash.base64,
    signedPropertiesHash,
    signatureResult.signatureBase64,
    certificateContent,
  );
  let xml = insertUBLExtension(baseXml, ublExtension);

  // Step 7: Insert ds:Object with signed properties
  const signedPropertiesObject = buildSignedPropertiesObject(
    signingTime,
    certificateDigestValue,
    certInfo.issuer,
    certInfo.serialNumber,
  );
  xml = insertSignedPropertiesObject(xml, signedPropertiesObject);

  // Step 8: Compute QR data
  const totalAmount = totalExcludeTax + params.tax;
  const qrData = getQRString(
    config.abbr,
    config.taxId,
    signingTime,
    totalAmount.toFixed(2),
    params.tax.toFixed(2),
    invoiceHash.base64,
    signatureResult.signatureBase64,
    certInfo.publicKeyBytes,
    certInfo.signatureBytes,
  );

  // Step 9: Update QR placeholder in XML
  xml = updateQRData(xml, qrData);

  // Step 10: Compute final hash for PIH (full canonical XML)
  const finalCanonical = canonicalizeXml(xml);
  const finalHash = computeHashBase64(finalCanonical);

  return {
    xml,
    qrData,
    invoiceHash: finalHash,
  };
}
