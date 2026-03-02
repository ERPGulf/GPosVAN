import { encodeTLV } from './tlv';

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Pure-JS Uint8Array → base64 (no Buffer needed). */
function uint8ToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += CHARS[b0 >> 2];
    result += CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? CHARS[b2 & 63] : '=';
  }
  return result;
}

export function buildQRPayload(data: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: string;
  vat: string;
  hash: string;
  signature: string;
  publicKey: string;
  certHash: string;
}) {
  const tags = [
    encodeTLV(1, data.sellerName),
    encodeTLV(2, data.vatNumber),
    encodeTLV(3, data.timestamp),
    encodeTLV(4, data.total),
    encodeTLV(5, data.vat),
    encodeTLV(6, data.hash),
    encodeTLV(7, data.signature),
    encodeTLV(8, data.publicKey),
    encodeTLV(9, data.certHash),
  ];

  const totalLength = tags.reduce((sum, t) => sum + t.length, 0);

  const merged = new Uint8Array(totalLength);

  let offset = 0;

  tags.forEach((tag) => {
    merged.set(tag, offset);
    offset += tag.length;
  });

  return uint8ToBase64(merged);
}
