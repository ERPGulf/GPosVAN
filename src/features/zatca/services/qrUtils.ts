/**
 * ZATCA QR Code TLV encoding utilities.
 *
 * Generates the base64-encoded QR string with 9 ZATCA TLV tags:
 * 1. Seller name
 * 2. VAT registration number
 * 3. Invoice timestamp
 * 4. Invoice total (including VAT)
 * 5. VAT total
 * 6. Invoice hash (SHA-256 base64)
 * 7. ECDSA signature (base64)
 * 8. Public key (DER bytes)
 * 9. Certificate signature (DER bytes)
 */

/**
 * Create a TLV (Tag-Length-Value) byte array for a given tag and value.
 * Matches the C# GetTlvForValue logic.
 */
export function getTlvForValue(tagNum: number, tagValue: string | Uint8Array): Uint8Array {
  let valueBytes: Uint8Array;

  if (typeof tagValue === 'string') {
    // Encode string as UTF-8
    const encoder = new TextEncoder();
    valueBytes = encoder.encode(tagValue);
  } else {
    valueBytes = tagValue;
  }

  let tagValueLenBuf: Uint8Array;
  if (valueBytes.length < 256) {
    tagValueLenBuf = new Uint8Array([valueBytes.length]);
  } else {
    tagValueLenBuf = new Uint8Array([
      0xff,
      (valueBytes.length >> 8) & 0xff,
      valueBytes.length & 0xff,
    ]);
  }

  const tagNumBuf = new Uint8Array([tagNum]);

  // Combine: [tag] [length] [value]
  const result = new Uint8Array(tagNumBuf.length + tagValueLenBuf.length + valueBytes.length);
  result.set(tagNumBuf, 0);
  result.set(tagValueLenBuf, tagNumBuf.length);
  result.set(valueBytes, tagNumBuf.length + tagValueLenBuf.length);
  return result;
}

/**
 * Build the ZATCA QR code data string (base64-encoded TLV).
 */
export function getQRString(
  sellerName: string,
  vatRegistration: string,
  timestamp: string,
  totalAmount: string,
  taxAmount: string,
  xmlHash: string,
  signatureBase64: string,
  publicKeyBytes: number[],
  signatureKeyBytes: number[],
): string {
  const tags: Uint8Array[] = [
    getTlvForValue(1, sellerName),
    getTlvForValue(2, vatRegistration),
    getTlvForValue(3, timestamp),
    getTlvForValue(4, totalAmount),
    getTlvForValue(5, taxAmount),
    getTlvForValue(6, xmlHash),
    getTlvForValue(7, signatureBase64),
    getTlvForValue(8, new Uint8Array(publicKeyBytes)),
    getTlvForValue(9, new Uint8Array(signatureKeyBytes)),
  ];

  // Combine all TLV arrays
  const totalLength = tags.reduce((sum, arr) => sum + arr.length, 0);
  const combined = new Uint8Array(totalLength);
  let offset = 0;
  for (const tag of tags) {
    combined.set(tag, offset);
    offset += tag.length;
  }

  // Base64 encode
  return uint8ArrayToBase64(combined);
}

/** Convert Uint8Array to base64 string (works in React Native) */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
