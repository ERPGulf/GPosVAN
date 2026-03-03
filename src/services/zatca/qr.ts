/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – QR TLV payload builder                        */
/* ------------------------------------------------------------------ */

import { bytesToBase64 } from './certificate';
import { encodeTLV, encodeTLVBytes } from './tlv';

export interface QRPayloadInput {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: string;
  vat: string;
  hash: string;              // base-64 invoice hash
  signature: string;          // base-64 signature
  publicKeyBytes: Uint8Array; // raw bytes for tag 8
  certSignatureBytes: Uint8Array; // raw bytes for tag 9
}

/**
 * Build the ZATCA QR TLV payload and return it as a base-64 string.
 */
export function buildQRPayload(data: QRPayloadInput): string {
  const tags: Uint8Array[] = [
    encodeTLV(1, data.sellerName),
    encodeTLV(2, data.vatNumber),
    encodeTLV(3, data.timestamp),
    encodeTLV(4, data.total),
    encodeTLV(5, data.vat),
    encodeTLV(6, data.hash),
    encodeTLV(7, data.signature),
    encodeTLVBytes(8, data.publicKeyBytes),
    encodeTLVBytes(9, data.certSignatureBytes),
  ];

  const totalLength = tags.reduce((sum, t) => sum + t.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const tag of tags) {
    merged.set(tag, offset);
    offset += tag.length;
  }

  return bytesToBase64(merged);
}
