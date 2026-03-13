import { Zatca } from '@/src/utils/constants/app.settings';
import { Buffer } from 'buffer';
import { CertificateUtils } from './certificateUtils';
import { Directory, File, Paths } from 'expo-file-system';

export class QRUtils {
  /**
   * Saves QR data as Base64 text file (Expo cannot render bitmap directly like System.Drawing)
   */
  static async saveQR(qrData: string, invoiceUUID: string) {
    const textBytes = Buffer.from(qrData, 'utf8');
    const base64Encoded = textBytes.toString('base64');

    // parent invoices directory
    const invoicesDir = new Directory(Paths.document, 'invoices');

    if (!invoicesDir.exists) {
      await invoicesDir.create();
    }

    // invoice folder
    const dir = new Directory(invoicesDir, invoiceUUID);

    if (!dir.exists) {
      await dir.create();
    }

    const file = new File(dir, `${invoiceUUID}.txt`);

    await file.write(base64Encoded);

    return file.uri;
  }

  /**
   * ZATCA TLV QR string generator
   */
  static async GetQRString(
    xmlHash: string,
    currentDate: string,
    totalAmount: number,
    totalTaxAmount: number,
    signature: Uint8Array,
  ): Promise<string> {
    const tagsBufsArray: Uint8Array[] = [];

    const sellerName = this.GetTlvForValue(1, Zatca.Abbr);
    const vatRegistration = this.GetTlvForValue(2, Zatca.TaxId);
    const time = this.GetTlvForValue(3, currentDate);
    const amount = this.GetTlvForValue(4, totalAmount.toFixed(2));
    const taxAmount = this.GetTlvForValue(5, totalTaxAmount.toFixed(2));
    const hash = this.GetTlvForValue(6, xmlHash);
    const signatureValue = this.GetTlvForValue(7, Buffer.from(signature).toString('base64'));
    const tag8PublicKey = this.GetTlvForValue(8, CertificateUtils.getPublicKeyHashBytes());
    const certSignature = await CertificateUtils.getCertificateSignature();
    const signatureECDA = this.GetTlvForValue(9, certSignature);
    // const signatureECDA = this.GetTlvForValue(9, await CertificateUtils.getSignatureKeyHashBytes());

    tagsBufsArray.push(
      sellerName,
      vatRegistration,
      time,
      amount,
      taxAmount,
      hash,
      signatureValue,
      tag8PublicKey,
      signatureECDA,
    );

    const totalBytes = this.CombineByteArrays(tagsBufsArray);

    return Buffer.from(totalBytes).toString('base64');
  }

  static CombineByteArrays(byteArrayList: Uint8Array[]): Uint8Array {
    let totalLength = 0;

    for (const arr of byteArrayList) {
      totalLength += arr.length;
    }

    const result = new Uint8Array(totalLength);

    let offset = 0;

    for (const arr of byteArrayList) {
      result.set(arr, offset);
      offset += arr.length;
    }

    return result;
  }

  static ConvertHexStringToBytes(hex: string): Uint8Array {
    if (!hex) {
      throw new Error('Hex string is null or empty!');
    }

    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }

    return bytes;
  }

  static ConvertToHex(str: string): string {
    let hex = '';

    for (let i = 0; i < str.length; i++) {
      hex += str.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase();
    }

    return hex;
  }

  static ConvertBytesToHex(bytes: Uint8Array): string {
    let hex = '';

    for (const b of bytes) {
      hex += b.toString(16).padStart(2, '0').toUpperCase();
    }

    return hex;
  }

  static GetTlvForValue(tagNum: number, tagValue: string | Uint8Array): Uint8Array {
    if (tagValue === null || tagValue === undefined) {
      throw new Error(`Error: Tag value for tag number ${tagNum} is null`);
    }

    let tagValueBytes: Uint8Array;
    let tagValueLenBuf: Uint8Array;

    if (typeof tagValue === 'string') {
      tagValueBytes = Buffer.from(tagValue, 'utf8');

      if (tagValueBytes.length < 256) {
        tagValueLenBuf = new Uint8Array([tagValueBytes.length]);
      } else {
        tagValueLenBuf = new Uint8Array([
          0xff,
          (tagValueBytes.length >> 8) & 0xff,
          tagValueBytes.length & 0xff,
        ]);
      }
    } else if (tagValue instanceof Uint8Array) {
      tagValueBytes = tagValue;
      tagValueLenBuf = new Uint8Array([tagValueBytes.length]);
    } else {
      throw new Error('Unsupported tag value type. Must be string or byte array.');
    }

    const tagNumBuf = new Uint8Array([tagNum]);

    return this.CombineByteArrays([tagNumBuf, tagValueLenBuf, tagValueBytes]);
  }

  static FromHexString(hex: string): Uint8Array {
    if (!hex || hex.length % 2 !== 0) {
      throw new Error('Invalid hex string');
    }

    const bytes = new Uint8Array(hex.length / 2);

    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }

    return bytes;
  }
}
