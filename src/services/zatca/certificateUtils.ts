import { Buffer } from 'buffer';
import { File, Paths } from 'expo-file-system';
import { Zatca } from '../../utils/constants/app.settings';
import * as Crypto from 'expo-crypto';
import { X509Certificate } from '@peculiar/x509';
import { ec as EC } from 'elliptic';
export class CertificateUtils {
  static async createPEM(): Promise<void> {
    const certificateContent = Buffer.from(Zatca.Certificate, 'base64').toString('utf8');

    const publicKey = Buffer.from(Zatca.PublicKey, 'base64').toString('utf8');

    const privateKey = Buffer.from(Zatca.PrivateKey, 'base64').toString('utf8');

    let formattedCertificate = '';

    formattedCertificate += '-----BEGIN CERTIFICATE-----\n';

    // Split certificate into 64-character lines
    for (let i = 0; i < certificateContent.length; i += 64) {
      formattedCertificate +=
        certificateContent.substring(i, Math.min(i + 64, certificateContent.length)) + '\n';
    }

    formattedCertificate += '-----END CERTIFICATE-----\n';

    formattedCertificate += publicKey;
    formattedCertificate += privateKey;

    const fileName = this.getCertificatePath();

    const file = new File(Paths.document, fileName);

    await file.write(formattedCertificate);
  }

  static async isCertificateExists(): Promise<boolean> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    return file.exists;
  }

  static getCertificatePath(): string {
    return 'certificate.pem';
  }

  static async getDigestValue(): Promise<string | null> {
    try {
      const certificateData = Buffer.from(Zatca.Certificate, 'base64').toString('utf8');

      const hexHash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        certificateData,
      );

      const hexBytes = Buffer.from(hexHash, 'utf8');
      const base64EncodedHash = hexBytes.toString('base64');

      console.log(`CertDigestValue: ${base64EncodedHash}`);

      return base64EncodedHash;
    } catch (e: any) {
      console.log('Error in obtaining certificate hash: ' + e.message);
      return null;
    }
  }
  static async getCertificateSignature(): Promise<string | null> {
    try {
      const fileName = this.getCertificatePath();
      const file = new File(fileName);

      if (!file.exists) {
        await this.createPEM();
      }

      const pem = await file.text();

      const cert = new X509Certificate(pem);

      const signatureBytes = cert.signature;

      return Buffer.from(signatureBytes).toString('base64');
    } catch (e: any) {
      console.log('Error obtaining certificate signature: ' + e.message);
      return null;
    }
  }
  static async SignHashWithECDSA2(hashHex: string): Promise<string> {
    const pk = this.loadECPrivateKeyFromPem();

    const bytes = Buffer.from(hashHex, 'utf8');

    const signatureBytes = await this.signData(pk, bytes);

    return Buffer.from(signatureBytes).toString('base64');
  }
  static loadECPrivateKeyFromPem() {
    const ec = new EC('p256');

    const pemContent = Buffer.from(Zatca.PrivateKey, 'base64').toString('utf8').trim();

    const keyBase64 = pemContent
      .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
      .replace(/-----END EC PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '');

    const keyBytes = Buffer.from(keyBase64, 'base64');

    return ec.keyFromPrivate(keyBytes);
  }
  static async signData(privateKey: EC.KeyPair, dataToSign: Uint8Array) {
    const hashHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      Buffer.from(dataToSign).toString('utf8'),
    );

    const signature = privateKey.sign(hashHex);

    return Buffer.from(signature.toDER());
  }
  static hexToBytes(hex: string): Uint8Array {
    const length = hex.length;
    const bytes = new Uint8Array(length / 2);

    for (let i = 0; i < length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }

    return bytes;
  }
  static async getCertificate(): Promise<X509Certificate> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    return new X509Certificate(pem);
  }
  static async getCertificateRaw(): Promise<Uint8Array> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    return new Uint8Array(cert.rawData);
  }
  static async getCertificateIssuer(): Promise<string> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    return cert.issuer;
  }
  static async getSerialNumber(): Promise<string> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    return cert.serialNumber;
  }
  static async getPublicKeyHash(): Promise<string> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    const raw = new Uint8Array(cert.rawData);

    // locate uncompressed EC public key marker (0x04)
    const index = raw.findIndex((b, i) => b === 0x04 && raw.length - i >= 65);

    if (index === -1) {
      throw new Error('EC public key not found in certificate');
    }

    const ecPoint = raw.slice(index, index + 65);

    return Buffer.from(ecPoint).toString('base64');
  }
  static async getPublicKeyHashBytes2(): Promise<Uint8Array> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    const raw = new Uint8Array(cert.rawData);

    // Find EC uncompressed public key (0x04 + 64 bytes)
    const index = raw.findIndex((b, i) => b === 0x04 && raw.length - i >= 65);

    if (index === -1) {
      throw new Error('The public key is not an ECDSA key.');
    }

    return raw.slice(index, index + 65);
  }
  static getPublicKeyHashBytes(): Uint8Array {
    let publicKey = Buffer.from(Zatca.PublicKey, 'base64').toString('utf8');

    publicKey = publicKey
      .replace('-----BEGIN PUBLIC KEY-----', '')
      .replace('-----END PUBLIC KEY-----', '')
      .trim();

    const byteData = Buffer.from(publicKey, 'base64');

    // Convert to hex string
    const hexData = byteData.toString('hex').toLowerCase();

    // Rebuild byte array from hex pairs
    const binaryData = new Uint8Array(hexData.length / 2);

    for (let i = 0; i < hexData.length; i += 2) {
      binaryData[i / 2] = parseInt(hexData.substring(i, i + 2), 16);
    }

    return binaryData;
  }
  static async getSignatureKeyHash(): Promise<string> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    const signature = cert.signature;

    return Buffer.from(signature).toString('hex').toUpperCase();
  }
  static async getSignatureKeyHashBytes(): Promise<Uint8Array> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    return new Uint8Array(cert.signature);
  }
  static async computeDigest(data: Uint8Array, algorithm: string): Promise<Uint8Array> {
    let algo: Crypto.CryptoDigestAlgorithm;

    switch (algorithm.toUpperCase()) {
      case 'SHA256':
      case 'SHA-256':
        algo = Crypto.CryptoDigestAlgorithm.SHA256;
        break;
      case 'SHA1':
      case 'SHA-1':
        algo = Crypto.CryptoDigestAlgorithm.SHA1;
        break;
      case 'SHA384':
      case 'SHA-384':
        algo = Crypto.CryptoDigestAlgorithm.SHA384;
        break;
      case 'SHA512':
      case 'SHA-512':
        algo = Crypto.CryptoDigestAlgorithm.SHA512;
        break;
      default:
        throw new Error(`Hash algorithm '${algorithm}' is not supported.`);
    }

    const hex = await Crypto.digestStringAsync(algo, Buffer.from(data).toString('binary'));

    return new Uint8Array(Buffer.from(hex, 'hex'));
  }
}
