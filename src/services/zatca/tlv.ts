export function encodeTLV(tag: number, value: string): Uint8Array {
  const encoder = new TextEncoder();
  const valueBytes = encoder.encode(value);

  const length = valueBytes.length;

  let header: number[];

  // Normal length
  if (length <= 255) {
    header = [tag, length];
  }
  // Extended length (for large values like signature)
  else {
    const high = (length >> 8) & 0xff;
    const low = length & 0xff;

    header = [tag, 0xff, high, low];
  }

  const result = new Uint8Array(header.length + valueBytes.length);

  result.set(header, 0);
  result.set(valueBytes, header.length);

  return result;
}
