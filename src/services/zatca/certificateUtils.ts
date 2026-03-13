import { X509Certificate } from '@peculiar/x509';
import { Buffer } from 'buffer';
import { ec as EC } from 'elliptic';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { Zatca } from '../../utils/constants/app.settings';
export class CertificateUtils {
  static async createPEM(): Promise<void> {
    console.log('[Cert] ===== Creating PEM file =====');

    const certificateContent = Buffer.from(Zatca.Certificate, 'base64').toString('utf8');
    const publicKey = Buffer.from(Zatca.PublicKey, 'base64').toString('utf8');
    const privateKey = Buffer.from(Zatca.PrivateKey, 'base64').toString('utf8');

    console.log('[Cert] Certificate base64 length:', Zatca.Certificate.length);
    console.log('[Cert] Certificate decoded length:', certificateContent.length);

    console.log('[Cert] PublicKey base64 length:', Zatca.PublicKey.length);
    console.log('[Cert] PublicKey decoded length:', publicKey.length);

    console.log('[Cert] PrivateKey base64 length:', Zatca.PrivateKey.length);
    console.log('[Cert] PrivateKey decoded length:', privateKey.length);

    // Print first/last chars only (safe debugging)
    console.log('[Cert] PublicKey preview:', publicKey.substring(0, 40), '...');
    console.log('[Cert] PrivateKey preview:', privateKey.substring(0, 40), '...');

    let formattedCertificate = '';

    formattedCertificate += '-----BEGIN CERTIFICATE-----\n';

    for (let i = 0; i < certificateContent.length; i += 64) {
      formattedCertificate +=
        certificateContent.substring(i, Math.min(i + 64, certificateContent.length)) + '\n';
    }

    formattedCertificate += '-----END CERTIFICATE-----\n';

    formattedCertificate += publicKey;
    formattedCertificate += privateKey;

    const file = new File(Paths.document, 'certificate.pem');

    console.log('[Cert] Writing PEM file to:', file.uri);

    await file.write(formattedCertificate);

    console.log('[Cert] PEM file written successfully');

    const writtenSize = formattedCertificate.length;

    console.log('[Cert] PEM size (chars):', writtenSize);

    console.log('[Cert] ===== PEM creation complete =====');
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

  static async getDigestValue(): Promise<string> {
    const certificateData = Buffer.from(Zatca.Certificate, 'base64').toString('utf8');

    const certificateBytes = Buffer.from(certificateData, 'utf8');

    const hashHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      certificateBytes.toString('binary'),
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    const hexBytes = Buffer.from(hashHex, 'utf8');

    const base64EncodedHash = hexBytes.toString('base64');

    console.log('CertDigestValue:', base64EncodedHash);

    return base64EncodedHash;
  }

  static async getCertificateSignature(): Promise<string> {
    const fileName = this.getCertificatePath();
    const file = new File(Paths.document, fileName);

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    const signatureBuffer = cert.signature; // ArrayBuffer
    const signatureBytes = new Uint8Array(signatureBuffer);

    if (!signatureBytes || signatureBytes.byteLength === 0) {
      throw new Error('Certificate signature missing');
    }

    return Buffer.from(signatureBytes).toString('base64');
  }
  static async SignHashWithECDSA2(hashHex: string): Promise<string> {
    const pk = this.loadECPrivateKeyFromPem();

    const data = Buffer.from(hashHex, 'utf8');

    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      data.toString('binary'),
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    const signature = pk.sign(hash);

    const der = signature.toDER();

    return Buffer.from(der).toString('base64');
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
      Buffer.from(dataToSign).toString('binary'),
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    const signature = privateKey.sign(Buffer.from(hashHex, 'hex'));

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

    const hexSerial = cert.serialNumber.replace(/:/g, '').toLowerCase();

    const decimalSerial = BigInt('0x' + hexSerial).toString(10);

    return decimalSerial;
  }
  static async getPublicKeyHash(): Promise<string> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    const publicKeyRaw = new Uint8Array(cert.publicKey.rawData);

    // remove ASN.1 header to get EC point
    const ecPoint = publicKeyRaw.slice(-65);

    return Buffer.from(ecPoint).toString('base64');
  }
  static async getPublicKeyHashBytes2(): Promise<Uint8Array> {
    const file = new File(Paths.document, 'certificate.pem');

    if (!file.exists) {
      await this.createPEM();
    }

    const pem = await file.text();

    const cert = new X509Certificate(pem);

    const publicKeyRaw = new Uint8Array(cert.publicKey.rawData);

    return publicKeyRaw.slice(-65);
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
    try {
      console.log('[Cert] Reading certificate.pem');

      const file = new File(Paths.document, 'certificate.pem');

      if (!file.exists) {
        console.log('[Cert] certificate.pem not found → creating PEM');
        await this.createPEM();
      }

      const pem = await file.text();

      console.log('[Cert] PEM length:', pem.length);

      const cert = new X509Certificate(pem);

      console.log('[Cert] Certificate loaded');

      const signature = cert.signature;

      if (!signature) {
        throw new Error('Certificate signature not found');
      }

      const signatureBytes = new Uint8Array(signature);

      console.log('[Cert] Signature byte length:', signatureBytes.length);

      console.log('[Cert] Signature (base64):', Buffer.from(signatureBytes).toString('base64'));

      console.log('[Cert] Signature (hex):', Buffer.from(signatureBytes).toString('hex'));

      return signatureBytes;
    } catch (err: any) {
      console.error('[Cert] Error extracting certificate signature:', err.message);
      throw err;
    }
  }
  static async computeDigest(data: Uint8Array, algorithm: string): Promise<Uint8Array> {
    const hex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      Buffer.from(data).toString('binary'),
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    return new Uint8Array(Buffer.from(hex, 'hex'));
  }
  static async SignHashWithECDSABytes(hashHex: string): Promise<Uint8Array> {
    const ec = new EC('p256');

    const pemContent = Buffer.from(Zatca.PrivateKey, 'base64').toString('utf8');

    const keyBase64 = pemContent
      .replace(/-----BEGIN EC PRIVATE KEY-----/g, '')
      .replace(/-----END EC PRIVATE KEY-----/g, '')
      .replace(/\s+/g, '');

    const keyBytes = Buffer.from(keyBase64, 'base64');

    const key = ec.keyFromPrivate(keyBytes);

    const hashBytes = Buffer.from(hashHex, 'hex');

    const signature = key.sign(hashBytes);

    const der = signature.toDER();

    return new Uint8Array(der);
  }
}
