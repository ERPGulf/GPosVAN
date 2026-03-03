/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – hashing utilities                             */
/* ------------------------------------------------------------------ */

import * as Crypto from 'expo-crypto';
import { bytesToBase64 } from './certificate';

/**
 * SHA-256 hash a string, returning both hex and base-64 representations.
 * Mirrors C# `GetInvoiceHash`.
 */
export async function generateInvoiceHash(
  xml: string,
): Promise<{ hex: string; base64: string }> {
  // expo-crypto digest returns ArrayBuffer
  const encoder = new TextEncoder();
  const data = encoder.encode(xml);
  const hashBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
  const hashBytes = new Uint8Array(hashBuffer);

  const hex = bytesToHex(hashBytes);
  const base64 = bytesToBase64(hashBytes);

  return { hex, base64 };
}

/**
 * Generate the signed-properties hash.
 *
 * Builds the xades:SignedProperties XML template (matching the C# version),
 * SHA-256 hashes it, then returns base64( hex( SHA-256 ) ) — the exact
 * encoding the C# `GenerateSignedPropertiesHash` produces.
 */
export async function generateSignedPropertiesHash(
  signingTime: string,
  issuerName: string,
  serialNumber: string,
  encodedCertificateHash: string,
): Promise<string> {
  const xml =
    '<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">\n' +
    '                                    <xades:SignedSignatureProperties>\n' +
    '                                        <xades:SigningTime>' + signingTime + '</xades:SigningTime>\n' +
    '                                        <xades:SigningCertificate>\n' +
    '                                            <xades:Cert>\n' +
    '                                                <xades:CertDigest>\n' +
    '                                                    <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n' +
    '                                                    <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' + encodedCertificateHash + '</ds:DigestValue>\n' +
    '                                                </xades:CertDigest>\n' +
    '                                                <xades:IssuerSerial>\n' +
    '                                                    <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' + issuerName + '</ds:X509IssuerName>\n' +
    '                                                    <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' + serialNumber + '</ds:X509SerialNumber>\n' +
    '                                                </xades:IssuerSerial>\n' +
    '                                            </xades:Cert>\n' +
    '                                        </xades:SigningCertificate>\n' +
    '                                    </xades:SignedSignatureProperties>\n' +
    '                                </xades:SignedProperties>';

  const encoder = new TextEncoder();
  const data = encoder.encode(xml);
  const hashBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, data);
  const hashBytes = new Uint8Array(hashBuffer);

  // C# does: base64( utf8Bytes( hexLower( sha256 ) ) )
  const hexString = bytesToHex(hashBytes);
  const hexBytes = encoder.encode(hexString);
  return bytesToBase64(hexBytes);
}

/* ─── helpers ─── */

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, '0');
  }
  return hex;
}
