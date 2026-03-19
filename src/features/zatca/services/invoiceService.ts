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
import {
  createPemBundle,
  getCertificateInfo,
  getDigestValue,
  signHashWithECDSA,
} from './certificateUtils';
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
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const time = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${date}T${time}`;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function tryDecodeBase64Utf8(value: string): string | null {
  try {
    return atob(value.trim());
  } catch {
    return null;
  }
}

function printableRatio(value: string): number {
  if (!value) return 0;
  let printable = 0;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    const isPrintableAscii = code >= 32 && code <= 126;
    const isWhitespace = code === 10 || code === 13 || code === 9;
    if (isPrintableAscii || isWhitespace) printable++;
  }
  return printable / value.length;
}

function looksLikeBase64Body(value: string): boolean {
  const compact = value.replace(/\s+/g, '');
  return compact.length > 100 && /^[A-Za-z0-9+/=]+$/.test(compact);
}

function normalizeCertificateContent(raw: string): string {
  const direct = raw.trim();
  const decoded = tryDecodeBase64Utf8(direct)?.trim();

  if (decoded && printableRatio(decoded) > 0.9) {
    if (decoded.includes('BEGIN CERTIFICATE')) {
      return decoded
        .replace(/-----BEGIN CERTIFICATE-----/g, '')
        .replace(/-----END CERTIFICATE-----/g, '')
        .replace(/\s+/g, '');
    }
    if (looksLikeBase64Body(decoded)) {
      return decoded.replace(/\s+/g, '');
    }
  }

  if (direct.includes('BEGIN CERTIFICATE')) {
    return direct
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');
  }

  if (looksLikeBase64Body(direct)) {
    return direct.replace(/\s+/g, '');
  }

  throw new Error('Invalid ZATCA certificate content');
}

function normalizePrivateKeyPem(raw: string): string {
  const direct = raw.trim().replace(/\\n/g, '\n');
  const decoded = tryDecodeBase64Utf8(direct)?.trim().replace(/\\n/g, '\n');

  if (decoded && printableRatio(decoded) > 0.9) {
    if (decoded.includes('BEGIN EC PRIVATE KEY') || decoded.includes('BEGIN PRIVATE KEY')) {
      return decoded;
    }
  }

  if (direct.includes('BEGIN EC PRIVATE KEY') || direct.includes('BEGIN PRIVATE KEY')) {
    return direct;
  }

  throw new Error('Invalid ZATCA private key content');
}

function normalizePublicKeyPem(raw: string): string {
  const direct = raw.trim().replace(/\\n/g, '\n');
  const decoded = tryDecodeBase64Utf8(direct)?.trim().replace(/\\n/g, '\n');

  if (decoded && printableRatio(decoded) > 0.9 && decoded.includes('BEGIN PUBLIC KEY')) {
    return decoded;
  }

  if (direct.includes('BEGIN PUBLIC KEY')) {
    return direct;
  }

  throw new Error('Invalid ZATCA public key content');
}

function decodeBase64BytesStrict(value: string, fieldName: string): Uint8Array {
  const normalized = value.replace(/\s+/g, '').trim();
  let binary: string;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error(`Invalid ZATCA ${fieldName}: expected base64-encoded binary content`);
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getConfiguredPublicKeyDerBytes(publicKeyBase64: string): number[] {
  const publicKeyPem = normalizePublicKeyPem(publicKeyBase64);
  const publicKeyBody = publicKeyPem
    .replace(/-----BEGIN PUBLIC KEY-----/g, '')
    .replace(/-----END PUBLIC KEY-----/g, '')
    .replace(/\s+/g, '');

  const publicKeyDer = decodeBase64BytesStrict(publicKeyBody, 'public key PEM body');
  return Array.from(publicKeyDer);
}

function countLines(value: string): number {
  if (!value) return 0;
  return value.split(/\r?\n/).length;
}

function summarizeBundle(value: string): Record<string, unknown> {
  const lines = value.split(/\r?\n/).filter(Boolean);
  return {
    bundleLength: value.length,
    bundleLineCount: countLines(value),
    containsCertBlock: value.includes('BEGIN CERTIFICATE'),
    containsPublicKeyBlock: value.includes('BEGIN PUBLIC KEY'),
    containsPrivateKeyBlock:
      value.includes('BEGIN EC PRIVATE KEY') || value.includes('BEGIN PRIVATE KEY'),
    firstNonEmptyLine: lines[0] ?? null,
    lastNonEmptyLine: lines[lines.length - 1] ?? null,
  };
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
    const certificateContent = normalizeCertificateContent(config.certificate);
    const publicKeyPem = normalizePublicKeyPem(config.publicKey);
    const privateKeyPem = normalizePrivateKeyPem(config.privateKey);

    zatcaLogger.debug('Normalized ZATCA signing material', {
      invoiceUUID,
      certBodyLength: certificateContent.length,
      publicKeyLength: publicKeyPem.length,
      signingKeyLength: privateKeyPem.length,
      publicKeyLineCount: countLines(publicKeyPem),
      signingKeyLineCount: countLines(privateKeyPem),
      publicKeyHasHeader: publicKeyPem.includes('BEGIN PUBLIC KEY'),
      signingKeyHasHeader:
        privateKeyPem.includes('BEGIN EC PRIVATE KEY') ||
        privateKeyPem.includes('BEGIN PRIVATE KEY'),
    });

    const certPem = createPemBundle(
      btoa(certificateContent),
      btoa(publicKeyPem),
      btoa(privateKeyPem),
    );

    zatcaLogger.debug('Combined signing bundle ready', {
      invoiceUUID,
      ...summarizeBundle(certPem),
    });

    const certInfo = getCertificateInfo(certPem);
    const configuredPublicKeyBytes = getConfiguredPublicKeyDerBytes(config.publicKey);

    zatcaLogger.debug('ZATCA certificate/private key decoded', {
      invoiceUUID,
      certificateLength: certificateContent.length,
      privateKeyLength: privateKeyPem.length,
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

    const tax = round2((totalExcludeTax * 15) / 100);

    zatcaLogger.info('Invoice totals computed', {
      invoiceUUID,
      totalExcludeTax: round2(totalExcludeTax),
      tax,
      discount: round2(params.discount),
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
      tax,
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
    const totalAmount = totalExcludeTax + tax;
    const qrData = getQRString(
      config.abbr,
      config.taxId,
      signingTime,
      totalAmount.toFixed(2),
      tax.toFixed(2),
      invoiceHash.base64,
      signatureResult.signatureBase64,
      configuredPublicKeyBytes,
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
