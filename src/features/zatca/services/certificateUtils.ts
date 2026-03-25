import type { CertificateInfo, HashResult, SignatureResult } from '@/modules/zatca-crypto';
import ZatcaCrypto from '@/modules/zatca-crypto';
import { zatcaLogger } from './zatcaLogger';

function countLines(value: string): number {
  if (!value) return 0;
  return value.split(/\r?\n/).length;
}

function getNativeModuleDiagnostics(): Record<string, unknown> {
  const nativeModule = ZatcaCrypto as Record<string, unknown>;
  return {
    moduleType: typeof ZatcaCrypto,
    hasCreatePemBundle: typeof nativeModule.createPemBundle === 'function',
    availableMethods: Object.keys(nativeModule)
      .filter((key) => typeof nativeModule[key] === 'function')
      .sort(),
  };
}

function summarizeBundle(bundle: string): Record<string, unknown> {
  const lines = bundle.split(/\r?\n/).filter(Boolean);
  return {
    bundleLength: bundle.length,
    bundleLineCount: countLines(bundle),
    containsCertBlock: bundle.includes('BEGIN CERTIFICATE'),
    containsPublicKeyBlock: bundle.includes('BEGIN PUBLIC KEY'),
    containsPrivateKeyBlock:
      bundle.includes('BEGIN EC PRIVATE KEY') || bundle.includes('BEGIN PRIVATE KEY'),
    firstNonEmptyLine: lines[0] ?? null,
    lastNonEmptyLine: lines[lines.length - 1] ?? null,
  };
}

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
  const diagnostics = getNativeModuleDiagnostics();

  zatcaLogger.debug('Preparing native PEM bundle creation', {
    certBodyLength: certificate.length,
    publicKeyLength: publicKey.length,
    signingKeyLength: privateKey.length,
    publicKeyLineCount: countLines(publicKey),
    signingKeyLineCount: countLines(privateKey),
    publicKeyHasHeader: publicKey.includes('BEGIN PUBLIC KEY'),
    signingKeyHasHeader:
      privateKey.includes('BEGIN EC PRIVATE KEY') || privateKey.includes('BEGIN PRIVATE KEY'),
    ...diagnostics,
  });

  const nativeCreatePemBundle = (ZatcaCrypto as Record<string, unknown>).createPemBundle;
  if (typeof nativeCreatePemBundle !== 'function') {
    const error = new TypeError('ZatcaCrypto.createPemBundle is not available');
    zatcaLogger.error('Native PEM bundle method unavailable', error, diagnostics);
    throw error;
  }

  try {
    const bundle = nativeCreatePemBundle(certificate, publicKey, privateKey) as string;
    zatcaLogger.debug('Native PEM bundle created', summarizeBundle(bundle));
    return bundle;
  } catch (error) {
    zatcaLogger.error('Native PEM bundle creation failed', error, {
      certBodyLength: certificate.length,
      publicKeyLength: publicKey.length,
      signingKeyLength: privateKey.length,
      ...diagnostics,
    });
    throw error;
  }
}

/** SHA-256 hash returning hex and base64 */
export function sha256Hash(data: string): HashResult {
  return ZatcaCrypto.sha256Hash(data);
}
