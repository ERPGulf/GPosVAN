import { Zatca } from '@/src/utils/constants/app.settings';
import { Buffer } from 'buffer';
import { Directory, File, Paths } from 'expo-file-system';
import { CertificateUtils } from './certificateUtils';

export class QRUtils {
  /**
   * Saves QR data as Base64 text file (Expo cannot render bitmap directly like System.Drawing)
   */
  static async saveQR(qrData: string, invoiceUUID: string) {
    const invoicesDir = new Directory(Paths.document, 'invoices');

    if (!invoicesDir.exists) {
      await invoicesDir.create();
    }

    const dir = new Directory(invoicesDir, invoiceUUID);

    if (!dir.exists) {
      await dir.create();
    }

    const file = new File(dir, `${invoiceUUID}.txt`);

    // store QR data directly
    await file.write(qrData);

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
    console.log('[QR] ===== Generating QR =====');

    const tagsBufsArray: Uint8Array[] = [];

    const sellerName = this.GetTlvForValue(1, Zatca.Abbr);
    console.log('[QR] Tag1 Seller:', Zatca.Abbr);

    const vatRegistration = this.GetTlvForValue(2, Zatca.TaxId);
    console.log('[QR] Tag2 VAT:', Zatca.TaxId);

    const time = this.GetTlvForValue(3, currentDate);
    console.log('[QR] Tag3 Timestamp:', currentDate);

    const amount = this.GetTlvForValue(4, totalAmount.toFixed(2));
    console.log('[QR] Tag4 TotalAmount:', totalAmount.toFixed(2));

    const taxAmount = this.GetTlvForValue(5, totalTaxAmount.toFixed(2));
    console.log('[QR] Tag5 TaxAmount:', totalTaxAmount.toFixed(2));

    const hash = this.GetTlvForValue(6, xmlHash);
    console.log('[QR] Tag6 InvoiceHash:', xmlHash);

    const signatureBase64 = Buffer.from(signature).toString('base64');
    const signatureValue = this.GetTlvForValue(7, signatureBase64);
    console.log('[QR] Tag7 SignatureValue (base64):', signatureBase64);

    const publicKeyBytes = CertificateUtils.getPublicKeyHashBytes();
    console.log('[QR] Tag8 PublicKey bytes length:', publicKeyBytes.length);
    console.log('[QR] Tag8 PublicKey hex:', Buffer.from(publicKeyBytes).toString('hex'));

    const tag8PublicKey = this.GetTlvForValue(8, publicKeyBytes);

    const certSignatureBytes = await CertificateUtils.getSignatureKeyHashBytes();
    console.log('[QR] Tag9 CertSignature length:', certSignatureBytes.length);
    console.log('[QR] Tag9 CertSignature hex:', Buffer.from(certSignatureBytes).toString('hex'));

    const signatureECDA = this.GetTlvForValue(9, certSignatureBytes);

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

    console.log('[QR] TLV total bytes length:', totalBytes.length);
    console.log('[QR] TLV hex:', Buffer.from(totalBytes).toString('hex'));

    const qrBase64 = Buffer.from(totalBytes).toString('base64');

    console.log('[QR] Final QR Base64:', qrBase64);
    console.log('[QR] ===== QR Generation Complete =====');

    return qrBase64;
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
