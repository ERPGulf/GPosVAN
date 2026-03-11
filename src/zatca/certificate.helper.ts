import { X509Certificate } from '@peculiar/x509';

export class CertificateHelper {
  private static certificatePem: string;
  private static privateKeyPem: string;
  private static certificate: X509Certificate | null = null;

  static initialize(privateKeyPem: string, certificatePem: string) {
    this.privateKeyPem = privateKeyPem;
    this.certificatePem = certificatePem;
    this.certificate = new X509Certificate(certificatePem);
  }

  static getPublicKeyBytes(): Buffer {
    if (!this.certificate) {
      throw new Error('CertificateHelper not initialized');
    }

    const spki = this.certificate.publicKey.rawData;
    return Buffer.from(spki);
  }

  static async getPublicKeyHashBytes(): Promise<Buffer> {
    const hash = await globalThis.crypto.subtle.digest(
      'SHA-256',
      new Uint8Array(this.getPublicKeyBytes()),
    );

    return Buffer.from(hash);
  }

  static getCertificateBase64(): string {
    return this.certificatePem
      .replace('-----BEGIN CERTIFICATE-----', '')
      .replace('-----END CERTIFICATE-----', '')
      .replace(/\n/g, '');
  }

  static getPrivateKey(): string {
    return this.privateKeyPem;
  }
}
