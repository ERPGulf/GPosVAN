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
import { zatcaLogger } from './zatcaLogger';

function formatDateTime(d: Date): string {
  const date = d.toISOString().split('T')[0];
  const time = d.toTimeString().split(' ')[0];
  return `${date}T${time}`;
}

function tryBase64Decode(value: string): string | null {
  let normalized = value.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');

  if (!normalized) return null;

  const remainder = normalized.length % 4;
  if (remainder !== 0) {
    normalized = normalized + '='.repeat(4 - remainder);
  }

  try {
    return atob(normalized);
  } catch {
    return null;
  }
}

function stripWhitespace(value: string): string {
  return value.replace(/\s+/g, '');
}

function extractCertificateBody(value: string): string {
  return stripWhitespace(
    value
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\\n/g, ''),
  );
}

function looksLikeBase64(value: string): boolean {
  const compact = stripWhitespace(value);
  return compact.length > 0 && /^[A-Za-z0-9+/=]+$/.test(compact);
}

function collectCertificateCandidates(rawValue: string): string[] {
  const direct = rawValue.trim();
  const decoded = tryBase64Decode(direct)?.trim() ?? '';
  const decodedTwice = decoded ? (tryBase64Decode(decoded)?.trim() ?? '') : '';

  const directPem = direct.includes('BEGIN CERTIFICATE') ? extractCertificateBody(direct) : '';
  const decodedPem = decoded.includes('BEGIN CERTIFICATE') ? extractCertificateBody(decoded) : '';
  const decodedTwicePem = decodedTwice.includes('BEGIN CERTIFICATE')
    ? extractCertificateBody(decodedTwice)
    : '';

  const candidates: string[] = [];

  if (decodedTwicePem) candidates.push(decodedTwicePem);
  if (decodedPem) candidates.push(decodedPem);
  if (directPem) candidates.push(directPem);

  if (looksLikeBase64(decodedTwice)) candidates.push(stripWhitespace(decodedTwice));
  if (looksLikeBase64(decoded)) candidates.push(stripWhitespace(decoded));
  if (looksLikeBase64(direct)) candidates.push(stripWhitespace(direct));

  // Keep unique candidates and drop obviously invalid short payloads.
  return Array.from(new Set(candidates)).filter((item) => item.length > 300);
}

function normalizePrivateKey(rawValue: string): string {
  const direct = rawValue.trim();
  if (direct.includes('BEGIN EC PRIVATE KEY') || direct.includes('BEGIN PRIVATE KEY')) {
    return direct.replace(/\\n/g, '\n');
  }

  const decoded = tryBase64Decode(direct)?.trim();
  if (
    decoded &&
    (decoded.includes('BEGIN EC PRIVATE KEY') || decoded.includes('BEGIN PRIVATE KEY'))
  ) {
    return decoded.replace(/\\n/g, '\n');
  }

  return direct;
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
  const startedAt = Date.now();
  const invoiceUUID = params.invoiceUUID;

  zatcaLogger.info('Invoice generation started', {
    invoiceUUID,
    invoiceNumber: params.invoiceNumber,
    invoiceTypeCode: params.invoiceTypeCode,
    invoiceSubType: params.invoiceSubType,
    itemCount: params.cartItems.length,
    isTaxIncludedInPrice: config.isTaxIncludedInPrice,
  });

  try {
    // Support certificate input as PEM text, base64 PEM, or layered base64 DER content.
    const certificateCandidates = collectCertificateCandidates(config.certificate);
    if (certificateCandidates.length === 0) {
      throw new Error('Invalid ZATCA certificate format');
    }

    let certPem = '';
    let certificateContent = '';
    let certInfo: ReturnType<typeof getCertificateInfo> | null = null;
    let certificateParseError: unknown = null;

    for (const candidate of certificateCandidates) {
      const candidatePem = buildCertificatePem(candidate);
      try {
        certInfo = getCertificateInfo(candidatePem);
        certPem = candidatePem;
        certificateContent = candidate;
        break;
      } catch (error) {
        certificateParseError = error;
        zatcaLogger.warn('Certificate candidate parse attempt failed', {
          invoiceUUID,
          candidateLength: candidate.length,
        });
      }
    }

    if (!certInfo) {
      zatcaLogger.error('Certificate parsing failed', certificateParseError, {
        invoiceUUID,
        certificateCandidates: certificateCandidates.length,
      });
      throw certificateParseError instanceof Error
        ? certificateParseError
        : new Error('Failed to parse certificate from all candidates');
    }

    const privateKeyPem = normalizePrivateKey(config.privateKey);

    zatcaLogger.debug('ZATCA certificate/private key decoded', {
      invoiceUUID,
      certificateLength: certificateContent.length,
      privateKeyLength: privateKeyPem.length,
      certificateCandidates: certificateCandidates.length,
    });

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

    zatcaLogger.info('Invoice totals computed', {
      invoiceUUID,
      totalExcludeTax: Number(totalExcludeTax.toFixed(2)),
      tax: Number(params.tax.toFixed(2)),
      discount: Number(params.discount.toFixed(2)),
    });

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

    zatcaLogger.debug('Base XML generated', {
      invoiceUUID,
      xmlLength: baseXml.length,
    });

    // Step 2: Compute invoice hash (remove tags + C14N + SHA-256)
    const invoiceHash = generateInvoiceHash(baseXml);

    // Step 3: Compute certificate digest
    let certificateDigestValue;
    try {
      certificateDigestValue = getDigestValue(certificateContent);
    } catch (error) {
      zatcaLogger.error('Certificate digest computation failed', error, {
        invoiceUUID,
        certContentLength: certificateContent.length,
      });
      throw error;
    }

    zatcaLogger.info('Certificate info parsed', {
      invoiceUUID,
      certPemLength: certPem.length,
      certContentLength: certificateContent.length,
      issuer: certInfo.issuer,
      serialNumber: certInfo.serialNumber,
    });

    // Step 4: Compute signed properties hash
    const signingTime = formatDateTime(params.invoiceDate);
    const signedPropertiesHash = generateSignedPropertiesHash(
      signingTime,
      certInfo.issuer,
      certInfo.serialNumber,
      certificateDigestValue,
    );

    // Step 5: Sign the invoice hash with ECDSA
    let signatureResult;
    try {
      signatureResult = signHashWithECDSA(invoiceHash.hex, privateKeyPem);
    } catch (error) {
      zatcaLogger.error('ECDSA signing failed', error, {
        invoiceUUID,
        invoiceHashHexLength: invoiceHash.hex.length,
        privateKeyLength: privateKeyPem.length,
      });
      throw error;
    }

    zatcaLogger.info('Invoice hash signed', {
      invoiceUUID,
      invoiceHashBase64Length: invoiceHash.base64.length,
    });

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

    const durationMs = Date.now() - startedAt;
    zatcaLogger.info('Invoice generation completed', {
      invoiceUUID,
      durationMs,
      finalXmlLength: xml.length,
      qrLength: qrData.length,
      finalHashLength: finalHash.length,
    });

    return {
      xml,
      qrData,
      invoiceHash: finalHash,
    };
  } catch (error) {
    zatcaLogger.error('Invoice generation failed', error, {
      invoiceUUID,
      invoiceNumber: params.invoiceNumber,
      itemCount: params.cartItems.length,
    });
    throw error;
  }
}
