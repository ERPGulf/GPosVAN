import { CertificateHelper } from './certificate.helper';

export class QREncoder {
  private static tlv(tag: number, value: string | Uint8Array): Uint8Array {
    const valueBytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;

    const result = new Uint8Array(2 + valueBytes.length);

    result[0] = tag;
    result[1] = valueBytes.length;

    result.set(valueBytes, 2);

    return result;
  }

  private static concat(arrays: Uint8Array[]): Uint8Array {
    const total = arrays.reduce((sum, a) => sum + a.length, 0);

    const result = new Uint8Array(total);

    let offset = 0;

    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }

    return result;
  }

  private static base64(bytes: Uint8Array): string {
    let binary = '';

    const chunk = 0x8000;

    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }

    return btoa(binary);
  }

  /**
   * Simplified invoice QR (B2C)
   * ZATCA tags 1-5
   */
  static generateSimplified(data: {
    seller: string;
    vat: string;
    timestamp: string;
    total: string;
    vatTotal: string;
  }) {
    const buffers = [
      this.tlv(1, data.seller),
      this.tlv(2, data.vat),
      this.tlv(3, data.timestamp),
      this.tlv(4, Number(data.total).toFixed(2)),
      this.tlv(5, Number(data.vatTotal).toFixed(2)),
    ];

    return this.base64(this.concat(buffers));
  }

  /**
   * Cryptographic QR (Phase-2)
   * ZATCA tags 1-9
   */
  static async generateCryptographic(data: {
    seller: string;
    vat: string;
    timestamp: string;
    total: number;
    vatTotal: number;
    xmlHash: string;
    signature: string;
  }) {
    const publicKey = CertificateHelper.getPublicKeyBytes();
    const publicKeyHash = await CertificateHelper.getPublicKeyHashBytes();

    const buffers = [
      this.tlv(1, data.seller),
      this.tlv(2, data.vat),
      this.tlv(3, data.timestamp),
      this.tlv(4, data.total.toFixed(2)),
      this.tlv(5, data.vatTotal.toFixed(2)),
      this.tlv(6, data.xmlHash),
      this.tlv(7, data.signature),
      this.tlv(8, publicKey),
      this.tlv(9, publicKeyHash),
    ];

    return this.base64(this.concat(buffers));
  }
}
