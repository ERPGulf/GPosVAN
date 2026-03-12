import { Buffer } from 'buffer';

export class QREncoder {
  static tlv(tag: number, value: string | Uint8Array): Uint8Array {
    if (value === undefined || value === null) {
      throw new Error(`QR TLV tag ${tag} has empty value`);
    }

    const valueBytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;

    let lengthBytes: Uint8Array;

    if (valueBytes.length < 256) {
      lengthBytes = new Uint8Array([valueBytes.length]);
    } else {
      lengthBytes = new Uint8Array([
        0xff,
        (valueBytes.length >> 8) & 0xff,
        valueBytes.length & 0xff,
      ]);
    }

    const buffer = new Uint8Array(1 + lengthBytes.length + valueBytes.length);

    buffer[0] = tag;

    buffer.set(lengthBytes, 1);

    buffer.set(valueBytes, 1 + lengthBytes.length);

    return buffer;
  }

  static concat(buffers: Uint8Array[]) {
    const size = buffers.reduce((s, b) => s + b.length, 0);

    const result = new Uint8Array(size);

    let offset = 0;

    for (const buf of buffers) {
      result.set(buf, offset);
      offset += buf.length;
    }

    return result;
  }

  static base64(bytes: Uint8Array) {
    return Buffer.from(bytes).toString('base64');
  }

  static generate(data: {
    seller: string;
    vat: string;
    timestamp: string;
    total: string;
    vatTotal: string;
    xmlHash: string;
    signature: string;
    publicKey: Uint8Array;
    signatureKey: Uint8Array;
  }) {
    if (!(data.publicKey instanceof Uint8Array)) {
      throw new Error('QR publicKey must be Uint8Array');
    }

    if (!(data.signatureKey instanceof Uint8Array)) {
      throw new Error('QR signatureKey must be Uint8Array');
    }

    const buffers = [
      this.tlv(1, data.seller),

      this.tlv(2, data.vat),

      this.tlv(3, data.timestamp),

      this.tlv(4, data.total),

      this.tlv(5, data.vatTotal),

      this.tlv(6, data.xmlHash),

      // Signature must be Base64 string
      this.tlv(7, data.signature),

      // Raw bytes
      this.tlv(8, data.publicKey),

      this.tlv(9, data.signatureKey),
    ];

    return this.base64(this.concat(buffers));
  }
}
