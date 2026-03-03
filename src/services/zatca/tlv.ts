/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – TLV (Tag-Length-Value) encoding               */
/* ------------------------------------------------------------------ */

/**
 * Encode a TLV triplet for a **string** value.
 */
export function encodeTLV(tag: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);
  return encodeTLVBytes(tag, valueBytes);
}

/**
 * Encode a TLV triplet for a **raw byte-array** value
 * (used for tags 8 and 9 — public key & certificate signature).
 */
export function encodeTLVBytes(tag: number, valueBytes: Uint8Array): Uint8Array {
  const length = valueBytes.length;

  let header: number[];

  if (length < 256) {
    header = [tag, length];
  } else {
    // Extended length
    const high = (length >> 8) & 0xff;
    const low = length & 0xff;
    header = [tag, 0xff, high, low];
  }

  const result = new Uint8Array(header.length + valueBytes.length);
  result.set(header, 0);
  result.set(valueBytes, header.length);

  return result;
}
