import * as Crypto from 'expo-crypto';

export async function generateInvoiceHash(xml: string): Promise<string> {
  if (!xml) {
    throw new Error('XML input is empty');
  }

  /*
  Remove BOM and normalize
  */

  const normalized = xml
    .replace(/^\uFEFF/, '') // remove BOM
    .replace(/\r/g, '') // remove CR
    .trim();

  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, normalized, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });

  return hash;
}
