import type { CertificateInfo, HashResult, SignatureResult } from '@/modules/zatca-crypto';
import ZatcaCrypto from '@/modules/zatca-crypto';

/**
 * Compute certificate digest matching ZATCA's getDigestValue:
 * SHA-256(certContent) → hex → base64(utf8(hex))
 */
export function getDigestValue(certContent: string): string {
  return ZatcaCrypto.computeCertificateDigest(certContent);
}

/** Get certificate signature as base64 */
export function getCertificateSignature(certPem: string): string {
  const info = ZatcaCrypto.parseCertificate(certPem);
  return info.signatureBase64;
}

/** Sign data with ECDSA-SHA256 using a PEM private key */
export function signHashWithECDSA(data: string, privateKeyPem: string): SignatureResult {
  return ZatcaCrypto.signECDSA(data, privateKeyPem);
}

/** Parse certificate and return issuer, serial number, public key, signature */
export function getCertificateInfo(certPem: string): CertificateInfo {
  return ZatcaCrypto.parseCertificate(certPem);
}

/**
 * Build one combined PEM string matching legacy C# CreatePEM behavior:
 * CERTIFICATE block + public key text + private key text.
 */
export function createPemBundle(
  certificate: string,
  publicKey: string,
  privateKey: string,
): string {
  return ZatcaCrypto.createPemBundle(certificate, publicKey, privateKey);
}

/** SHA-256 hash returning hex and base64 */
export function sha256Hash(data: string): HashResult {
  return ZatcaCrypto.sha256Hash(data);
}
