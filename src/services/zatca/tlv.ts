export function encodeTLV(tag: number, value: string) {
  const encoder = new TextEncoder();

  const valueBytes = encoder.encode(value);

  return new Uint8Array([tag, valueBytes.length, ...valueBytes]);
}
