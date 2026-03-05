/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – X.509 certificate utilities                   */
/*                                                                    */
/*  Provides digest, issuer, serial-number, public-key and signature  */
/*  extraction from a base-64 encoded certificate (DER / PEM body).   */
/*  Uses expo-crypto for SHA-256 and lightweight ASN.1 DER parsing.   */
/* ------------------------------------------------------------------ */

import { ec as EC } from 'elliptic';
import * as Crypto from 'expo-crypto';

/* ====================================================================
 * Public API
 * ==================================================================== */

/**
 * SHA-256 digest of the raw certificate bytes, returned as base-64.
 */
export async function getCertificateDigestValue(certBase64: string): Promise<string> {
  // Decode certificate to DER
  const certBytes = decodeCertificate(certBase64);

  // SHA256 hash of DER
  const hashBuffer = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    certBytes.buffer as ArrayBuffer,
  );

  const hashBytes = new Uint8Array(hashBuffer);

  // Return Base64 of raw hash (NOT hex)
  return bytesToBase64(hashBytes);
}
/**
 * Extract the issuer distinguished-name as a human-readable string.
 * Example: "CN=TSZEINVOICE-SubCA-1, DC=extgazt, DC=gov, DC=local"
 */
export function getCertificateIssuer(certBase64: string): string {
  const der = base64ToBytes(certBase64);
  const tbsCert = parseTBSCertificate(der);
  return formatDN(tbsCert.issuer);
}

/**
 * Extract the certificate serial number as a decimal string.
 */
export function getSerialNumber(certBase64: string): string {
  const der = base64ToBytes(certBase64);
  const tbsCert = parseTBSCertificate(der);
  return tbsCert.serialNumber;
}

/**
 * Raw SubjectPublicKeyInfo bytes (for QR tag 8).
 */
export function getPublicKeyBytes(certBase64: string): Uint8Array {
  const der = base64ToBytes(certBase64);
  const tbsCert = parseTBSCertificate(der);
  return tbsCert.publicKeyBytes;
}
export function getPublicKeyBytesFromPem(publicKeyBase64: string): Uint8Array {
  // decode outer base64
  const pem = new TextDecoder().decode(base64ToBytes(publicKeyBase64));

  // remove headers
  const cleaned = pem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\n/g, '');

  // decode DER
  const der = base64ToBytes(cleaned);

  // last 65 bytes are the EC point
  return der.slice(-65);
}

export function decodeCertificate(certBase64: string): Uint8Array {
  // step 1: decode outer base64 -> PEM text
  const pem = new TextDecoder().decode(base64ToBytes(certBase64));

  // remove headers
  const cleaned = pem
    .replace('-----BEGIN CERTIFICATE-----', '')
    .replace('-----END CERTIFICATE-----', '')
    .replace(/\n/g, '')
    .trim();

  // step 2: decode inner base64 -> DER
  return base64ToBytes(cleaned);
}
/**
 * Raw certificate signature bytes (for QR tag 9).
 */
// export function getCertificateSignatureBytes(certBase64: string): Uint8Array {
//   const der = base64ToBytes(certBase64);
//   return parseSignatureValue(der);
// }
export function getCertificateSignatureBytes(certBase64: string): Uint8Array {
  const der = decodeCertificate(certBase64);
  return parseSignatureValue(der);
}
/* ====================================================================
 * Minimal ASN.1 / DER parser
 * ==================================================================== */

interface TBSInfo {
  serialNumber: string;
  issuer: Array<{ oid: string; value: string }>;
  publicKeyBytes: Uint8Array;
}

/**
 * Parse TBS (to-be-signed) certificate fields we need.
 *
 * X.509 structure (simplified):
 *   SEQUENCE {                       -- Certificate
 *     SEQUENCE {                     -- TBSCertificate
 *       [0] EXPLICIT INTEGER (version)
 *       INTEGER (serialNumber)
 *       SEQUENCE (signature algorithm)
 *       SEQUENCE (issuer)
 *       ...
 *       SEQUENCE (subjectPublicKeyInfo)
 *       ...
 *     }
 *     SEQUENCE (signatureAlgorithm)
 *     BIT STRING (signatureValue)
 *   }
 */
function parseTBSCertificate(der: Uint8Array): TBSInfo {
  let pos = 0;

  // Outer SEQUENCE (Certificate)
  const cert = readTag(der, pos);
  pos = cert.contentStart;

  // TBSCertificate SEQUENCE
  const tbs = readTag(der, pos);
  let tbsPos = tbs.contentStart;

  // [0] EXPLICIT – version (optional, present in v3 certs)
  const first = readTag(der, tbsPos);
  if (first.tagByte === 0xa0) {
    // skip version
    tbsPos = first.contentStart + first.contentLength;
  }

  // serialNumber INTEGER
  const serial = readTag(der, tbsPos);
  const serialNumber = bytesToBigInt(
    der.slice(serial.contentStart, serial.contentStart + serial.contentLength),
  );
  tbsPos = serial.contentStart + serial.contentLength;

  // signature algorithm SEQUENCE – skip
  const sigAlg = readTag(der, tbsPos);
  tbsPos = sigAlg.contentStart + sigAlg.contentLength;

  // issuer SEQUENCE
  const issuerSeq = readTag(der, tbsPos);
  const issuer = parseDN(der, issuerSeq.contentStart, issuerSeq.contentLength);
  tbsPos = issuerSeq.contentStart + issuerSeq.contentLength;

  // validity SEQUENCE – skip
  const validity = readTag(der, tbsPos);
  tbsPos = validity.contentStart + validity.contentLength;

  // subject SEQUENCE – skip
  const subject = readTag(der, tbsPos);
  tbsPos = subject.contentStart + subject.contentLength;

  // subjectPublicKeyInfo SEQUENCE
  const spki = readTag(der, tbsPos);
  // We want the raw BIT STRING value inside (the actual key bytes)
  let spkiPos = spki.contentStart;
  const pkAlg = readTag(der, spkiPos);
  spkiPos = pkAlg.contentStart + pkAlg.contentLength;
  const pkBits = readTag(der, spkiPos);
  // BIT STRING has a leading "unused bits" byte; skip it
  const publicKeyBytes = der.slice(
    pkBits.contentStart + 1,
    pkBits.contentStart + pkBits.contentLength,
  );

  return { serialNumber, issuer, publicKeyBytes };
}

/**
 * Extract the signature BIT STRING at the end of the Certificate SEQUENCE.
 */
function parseSignatureValue(der: Uint8Array): Uint8Array {
  let pos = 0;
  const cert = readTag(der, pos);
  pos = cert.contentStart;

  // TBS SEQUENCE – skip
  const tbs = readTag(der, pos);
  pos = tbs.contentStart + tbs.contentLength;

  // signature algorithm SEQUENCE – skip
  const sigAlg = readTag(der, pos);
  pos = sigAlg.contentStart + sigAlg.contentLength;

  // signatureValue BIT STRING
  const sigVal = readTag(der, pos);
  // skip leading "unused bits" byte
  return der.slice(sigVal.contentStart + 1, sigVal.contentStart + sigVal.contentLength);
}

/* ──── DN parsing ──── */

const OID_NAMES: Record<string, string> = {
  '2.5.4.3': 'CN',
  '2.5.4.6': 'C',
  '2.5.4.7': 'L',
  '2.5.4.8': 'ST',
  '2.5.4.10': 'O',
  '2.5.4.11': 'OU',
  '2.5.4.5': 'SERIALNUMBER',
  '0.9.2342.19200300.100.1.25': 'DC',
  '1.2.840.113549.1.9.1': 'E',
  '2.5.4.15': 'businessCategory',
};

function parseDN(
  der: Uint8Array,
  start: number,
  length: number,
): Array<{ oid: string; value: string }> {
  const result: Array<{ oid: string; value: string }> = [];
  let pos = start;
  const end = start + length;

  while (pos < end) {
    const set = readTag(der, pos); // SET
    let setPos = set.contentStart;
    const setEnd = set.contentStart + set.contentLength;

    while (setPos < setEnd) {
      const seq = readTag(der, setPos); // SEQUENCE (AttributeTypeAndValue)
      let seqPos = seq.contentStart;

      const oidTag = readTag(der, seqPos);
      const oid = decodeOID(
        der.slice(oidTag.contentStart, oidTag.contentStart + oidTag.contentLength),
      );
      seqPos = oidTag.contentStart + oidTag.contentLength;

      const valTag = readTag(der, seqPos);
      const value = new TextDecoder().decode(
        der.slice(valTag.contentStart, valTag.contentStart + valTag.contentLength),
      );

      result.push({ oid, value });
      setPos = seq.contentStart + seq.contentLength;
    }

    pos = set.contentStart + set.contentLength;
  }

  return result;
}

function formatDN(entries: Array<{ oid: string; value: string }>): string {
  return entries.map((e) => `${OID_NAMES[e.oid] ?? e.oid}=${e.value}`).join(', ');
}

/* ──── Low-level DER helpers ──── */

interface TagInfo {
  tagByte: number;
  contentStart: number;
  contentLength: number;
}

function readTag(data: Uint8Array, offset: number): TagInfo {
  const tagByte = data[offset];
  let pos = offset + 1;

  let contentLength = 0;
  const lenByte = data[pos];
  pos++;

  if (lenByte < 0x80) {
    contentLength = lenByte;
  } else {
    const numBytes = lenByte & 0x7f;
    for (let i = 0; i < numBytes; i++) {
      contentLength = (contentLength << 8) | data[pos];
      pos++;
    }
  }

  return { tagByte, contentStart: pos, contentLength };
}

function decodeOID(bytes: Uint8Array): string {
  const parts: number[] = [];
  parts.push(Math.floor(bytes[0] / 40));
  parts.push(bytes[0] % 40);

  let value = 0;
  for (let i = 1; i < bytes.length; i++) {
    value = (value << 7) | (bytes[i] & 0x7f);
    if ((bytes[i] & 0x80) === 0) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join('.');
}

function bytesToBigInt(bytes: Uint8Array): string {
  // Convert bytes to decimal string (handles arbitrary-length integers)
  let result = 0n;
  for (const b of bytes) {
    result = (result << 8n) | BigInt(b);
  }
  return result.toString();
}

/* ====================================================================
 * Base-64 ↔ Uint8Array  (pure JS, no Buffer)
 * ==================================================================== */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[\s\r\n]/g, '');
  const len = clean.length;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const byteLen = (len * 3) / 4 - pad;
  const arr = new Uint8Array(byteLen);

  let j = 0;
  for (let i = 0; i < len; i += 4) {
    const a = B64.indexOf(clean[i]);
    const b = B64.indexOf(clean[i + 1]);
    const c = B64.indexOf(clean[i + 2]);
    const d = B64.indexOf(clean[i + 3]);
    const bits = (a << 18) | (b << 12) | (c << 6) | d;
    if (j < byteLen) arr[j++] = (bits >> 16) & 0xff;
    if (j < byteLen) arr[j++] = (bits >> 8) & 0xff;
    if (j < byteLen) arr[j++] = bits & 0xff;
  }
  return arr;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += B64[b0 >> 2];
    result += B64[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? B64[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? B64[b2 & 63] : '=';
  }
  return result;
}

/* ====================================================================
 * CertificateUtils Class
 * Migrated from C# implementation
 * ==================================================================== */

/**
 * Extracts the 32-byte SEC1 private key scalar from a PKCS#8 or SEC1 PEM string.
 */
export function extractECPrivateKey(pem: string): Uint8Array {
  const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/[\s\r\n]+/g, '');
  const der = base64ToBytes(base64);

  // Look for the standard SEQUENCE containing the 32-byte private key.
  // SEC1 inside PKCS#8 or standalone SEC1 usually contains: 0x02 0x01 0x01 (version 1) followed by 0x04 0x20 (OCTET STRING 32 bytes)
  for (let i = 0; i < der.length - 34; i++) {
    if (
      der[i] === 0x02 &&
      der[i + 1] === 0x01 &&
      der[i + 2] === 0x01 &&
      der[i + 3] === 0x04 &&
      der[i + 4] === 0x20
    ) {
      return der.slice(i + 5, i + 37);
    }
  }

  // Fallback: just find any 32-byte OCTET STRING (0x04 0x20) inside the key
  for (let i = 0; i < der.length - 34; i++) {
    if (der[i] === 0x04 && der[i + 1] === 0x20) {
      return der.slice(i + 2, i + 34);
    }
  }

  throw new Error('Could not find EC private key in PEM');
}

/**
 * Signs a payload. Following the C# implementation, this converts the
 * input string to UTF-8 bytes, computes SHA-256 of those bytes, and
 * then signs the result using the ECDSA private key.
 */
export async function signHashWithECDSABytes(
  dataToSignStr: string,
  privateKeyPem: string,
): Promise<Uint8Array> {
  const pkBytes = extractECPrivateKey(privateKeyPem);
  const ec = new EC('p256');
  const keyPair = ec.keyFromPrivate(pkBytes);

  // Replicating C# Encoding.UTF8.GetBytes(hashHex)
  const utf8Bytes = new TextEncoder().encode(dataToSignStr);

  // Replicating C# SignerUtilities.GetSigner("SHA-256withECDSA"),
  // which calculates the SHA-256 hash before signing:
  const hashBuf = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    utf8Bytes.buffer as ArrayBuffer,
  );

  // Sign the digest
  const signature = keyPair.sign(new Uint8Array(hashBuf));

  // The signature must be DER encoded
  return new Uint8Array(signature.toDER());
}

/**
 * Returns the base64-encoded ECDSA signature of the payload string.
 */
export async function signHashWithECDSA2(
  dataToSignStr: string,
  privateKeyPem: string,
): Promise<string> {
  const sigBytes = await signHashWithECDSABytes(dataToSignStr, privateKeyPem);
  return bytesToBase64(sigBytes);
}

/**
 * Hex conversion helper
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * CertificateUtils class closely matching the structure of the C#
 * CertificateUtils implementations. Methods requiring the certificate
 * or keys take them as arguments rather than reading from a global store.
 */
export class CertificateUtils {
  static async getDigestValue(certBase64: string): Promise<string> {
    return getCertificateDigestValue(certBase64);
  }

  static GetCertificateSignature(certBase64: string): string {
    return bytesToBase64(getCertificateSignatureBytes(certBase64));
  }

  static async SignHashWithECDSA2(hashHex: string, privateKeyPem: string): Promise<string> {
    return signHashWithECDSA2(hashHex, privateKeyPem);
  }

  static async SignHashWithECDSABytes(hashHex: string, privateKeyPem: string): Promise<Uint8Array> {
    return signHashWithECDSABytes(hashHex, privateKeyPem);
  }

  static LoadECPrivateKeyFromPem(privateKeyPem: string): Uint8Array {
    return extractECPrivateKey(privateKeyPem);
  }

  static GetCertificateRaw(certBase64: string): Uint8Array {
    return base64ToBytes(certBase64);
  }

  static GetCertificateIssuer(certBase64: string): string {
    return getCertificateIssuer(certBase64);
  }

  static GetSerialNumber(certBase64: string): string {
    return getSerialNumber(certBase64);
  }

  static GetPublicKeyHash(certBase64: string): string {
    // Uncompressed public key base64 exactly matching GetPublicKeyHashBytes2 logic
    return bytesToBase64(getPublicKeyBytes(certBase64));
  }

  static GetPublicKeyHashBytes2(certBase64: string): Uint8Array {
    return getPublicKeyBytes(certBase64);
  }

  /**
   * Equivalent to C# GetPublicKeyHashBytes, which strips PEM headers
   * and base64 decodes the raw public key string.
   */
  static GetPublicKeyHashBytes(publicKeyPem: string): Uint8Array {
    const b64 = publicKeyPem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/[\r\n\s]/g, '');
    return base64ToBytes(b64);
  }

  static GetSignatureKeyHash(certBase64: string): string {
    return bytesToHex(getCertificateSignatureBytes(certBase64)).toUpperCase();
  }

  static GetSignatureKeyHashBytes(certBase64: string): Uint8Array {
    return getCertificateSignatureBytes(certBase64);
  }
}
