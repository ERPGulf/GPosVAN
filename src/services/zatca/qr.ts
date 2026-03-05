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
  hash: string; // base-64 invoice hash
  signatureBase64: string; // base-64 digital signature
  publicKeyBytes: Uint8Array; // raw bytes for tag 8
  certSignatureBytes: Uint8Array; // raw bytes for tag 9
}

/**
 * Build the ZATCA QR TLV payload and return it as a base-64 string.
 *
 * ZATCA TLV encoding:
 *  - Tags 1-5: UTF-8 string values
 *  - Tag 6: invoice hash as string (base64 hash encoded as UTF-8 bytes)
 *  - Tag 7: digital signature as string (base64 signature encoded as UTF-8 bytes)
 *  - Tag 8: raw public key bytes
 *  - Tag 9: raw certificate signature bytes
 */
export function buildQRPayload(data: QRPayloadInput): string {
  const tags: Uint8Array[] = [
    encodeTLV(1, data.sellerName),
    encodeTLV(2, data.vatNumber),
    encodeTLV(3, data.timestamp),
    encodeTLV(4, data.total),
    encodeTLV(5, data.vat),
    encodeTLV(6, data.hash), // base64 string as UTF-8 bytes
    encodeTLV(7, data.signatureBase64), // base64 string as UTF-8 bytes
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
