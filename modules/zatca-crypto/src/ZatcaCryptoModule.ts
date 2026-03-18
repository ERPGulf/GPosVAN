import { NativeModule, requireNativeModule } from 'expo';

export interface HashResult {
  hex: string;
  base64: string;
}

export interface SignatureResult {
  signatureBase64: string;
  signatureBytes: number[];
}

export interface CertificateInfo {
  issuer: string;
  serialNumber: string;
  signatureBase64: string;
  signatureBytes: number[];
  publicKeyBase64: string;
  publicKeyBytes: number[];
  rawBase64: string;
}

declare class ZatcaCryptoModule extends NativeModule {
  /** Canonicalize XML using C14N 1.1 */
  canonicalizeXml(xmlString: string): string;

  /** Remove UBLExtensions, Signature, QR AdditionalDocumentReference nodes, then canonicalize */
  removeTagsAndCanonicalize(xmlString: string): string;

  /** SHA-256 hash returning both hex and base64 */
  sha256Hash(data: string): HashResult;

  /** ECDSA-SHA256 sign data with a PEM private key */
  signECDSA(data: string, privateKeyPem: string): SignatureResult;

  /** Parse an X509 certificate from PEM */
  parseCertificate(certPem: string): CertificateInfo;

  /**
   * Compute certificate digest matching ZATCA's getDigestValue:
   * SHA-256(certContent) → hex string → base64(utf8(hex))
   */
  computeCertificateDigest(certContent: string): string;
}

export default requireNativeModule<ZatcaCryptoModule>('ZatcaCryptoModule');
