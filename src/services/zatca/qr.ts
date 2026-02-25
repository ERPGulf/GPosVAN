import { encodeTLV } from './tlv';

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

  return btoa(String.fromCharCode(...merged));
}
