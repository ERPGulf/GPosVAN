import ZatcaCrypto from '@/modules/zatca-crypto';
import { zatcaLogger } from './zatcaLogger';

/**
 * Generate the invoice hash:
 * 1. Remove UBLExtensions, Signature, QR AdditionalDocumentReference
 * 2. Canonicalize the remaining XML (C14N 1.1)
 * 3. SHA-256 hash the canonical XML
 *
 * Returns both hex and base64 representations.
 */
export function generateInvoiceHash(xmlString: string): { hex: string; base64: string } {
  zatcaLogger.debug('Generating invoice hash', {
    inputXmlLength: xmlString.length,
  });
  const canonicalXml = ZatcaCrypto.removeTagsAndCanonicalize(xmlString);
  const hash = ZatcaCrypto.sha256Hash(canonicalXml);

  // DEBUG: Log canonical XML for credit notes to diagnose hash mismatch
  const isCreditNote = xmlString.includes('>381</');
  if (isCreditNote) {
    zatcaLogger.info('CREDIT NOTE DEBUG: Canonical XML after tag removal', {
      canonicalXmlLength: canonicalXml.length,
      canonicalXmlFull: canonicalXml.length < 5000 ? canonicalXml : canonicalXml.substring(0, 5000),
      hashHex: hash.hex,
      hashBase64: hash.base64,
    });
  }

  zatcaLogger.debug('Invoice hash generated', {
    canonicalXmlLength: canonicalXml.length,
    hashBase64Length: hash.base64.length,
  });
  return hash;
}

/**
 * Generate the signed properties hash matching C# GenerateSignedPropertiesHash.
 *
 * Builds the xades:SignedProperties XML template, then:
 * SHA-256 → hex → base64(utf8(hex))
 */
export function generateSignedPropertiesHash(
  signingTime: string,
  issuerName: string,
  serialNumber: string,
  encodedCertificateHash: string,
): string {
  zatcaLogger.debug('Generating signed properties hash', {
    signingTime,
    issuerName,
    serialNumber,
  });

  const xmlTemplate =
    `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">\n` +
    `                                    <xades:SignedSignatureProperties>\n` +
    `                                        <xades:SigningTime>${signingTime}</xades:SigningTime>\n` +
    `                                        <xades:SigningCertificate>\n` +
    `                                            <xades:Cert>\n` +
    `                                                <xades:CertDigest>\n` +
    `                                                    <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n` +
    `                                                    <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${encodedCertificateHash}</ds:DigestValue>\n` +
    `                                                </xades:CertDigest>\n` +
    `                                                <xades:IssuerSerial>\n` +
    `                                                    <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>\n` +
    `                                                    <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serialNumber}</ds:X509SerialNumber>\n` +
    `                                                </xades:IssuerSerial>\n` +
    `                                            </xades:Cert>\n` +
    `                                        </xades:SigningCertificate>\n` +
    `                                    </xades:SignedSignatureProperties>\n` +
    `                                </xades:SignedProperties>`;

  // SHA-256 → hex → base64(utf8(hex))
  const hashResult = ZatcaCrypto.sha256Hash(xmlTemplate);
  // The C# code takes the hex string, gets its UTF-8 bytes, then base64-encodes those
  // which is equivalent to base64(hexString) since hex is already ASCII/UTF-8
  const signedPropertiesHash = btoa(hashResult.hex);
  zatcaLogger.debug('Signed properties hash generated', {
    hashLength: signedPropertiesHash.length,
    encodedCertificateHashLength: encodedCertificateHash.length,
  });
  return signedPropertiesHash;
}

/**
 * Canonicalize a full XML string (C14N 1.1, no tag removal).
 */
export function canonicalizeXml(xmlString: string): string {
  zatcaLogger.debug('Canonicalizing XML', {
    inputXmlLength: xmlString.length,
  });
  const canonical = ZatcaCrypto.canonicalizeXml(xmlString);
  zatcaLogger.debug('XML canonicalized', {
    canonicalXmlLength: canonical.length,
  });
  return canonical;
}

/**
 * Compute SHA-256 hash of a string, returning base64.
 */
export function computeHashBase64(data: string): string {
  const hash = ZatcaCrypto.sha256Hash(data).base64;
  zatcaLogger.debug('SHA-256 hash computed', {
    inputLength: data.length,
    hashLength: hash.length,
  });
  return hash;
}
