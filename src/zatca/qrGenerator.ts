export class QRGenerator {
  private tlv(tag: number, value: string) {
    const valueBuffer = Buffer.from(value, 'utf8');

    const tagBuffer = Buffer.from([tag]);
    const lengthBuffer = Buffer.from([valueBuffer.length]);

    return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
  }

  generate(data: {
    seller: string;
    vat: string;
    timestamp: string;
    total: string;
    vatTotal: string;
  }) {
    let timestamp = data.timestamp;

    if (timestamp.endsWith('Z')) timestamp = timestamp.slice(0, -1);

    if (timestamp.includes('.')) timestamp = timestamp.split('.')[0];

    const buffers = [
      this.tlv(1, data.seller),
      this.tlv(2, data.vat),
      this.tlv(3, timestamp),
      this.tlv(4, Number(data.total).toFixed(2)),
      this.tlv(5, Number(data.vatTotal).toFixed(2)),
    ];

    return Buffer.concat(buffers).toString('base64');
  }
}
