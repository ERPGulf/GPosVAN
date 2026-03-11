import { CertificateHelper } from './certificate.helper';

export class QRHelper {
  static async getQRString(
    xmlHash: string,
    currentDate: string,
    totalAmount: number,
    totalTaxAmount: number,
    signature: string,
    supplierName: string,
    vatNumber: string,
  ) {
    const buffers = [
      this.tlv(1, supplierName),
      this.tlv(2, vatNumber),
      this.tlv(3, currentDate),
      this.tlv(4, totalAmount.toFixed(2)),
      this.tlv(5, totalTaxAmount.toFixed(2)),
      this.tlv(6, xmlHash),
      this.tlv(7, signature),
      this.tlv(8, CertificateHelper.getPublicKeyBytes()),
      this.tlv(9, await CertificateHelper.getPublicKeyHashBytes()),
    ];

    return Buffer.concat(buffers).toString('base64');
  }

  private static tlv(tag: number, value: string | Buffer) {
    const valueBuffer = typeof value === 'string' ? Buffer.from(value, 'utf8') : value;

    const tagBuffer = Buffer.from([tag]);
    const lengthBuffer = Buffer.from([valueBuffer.length]);

    return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
  }
}
