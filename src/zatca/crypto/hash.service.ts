import * as Crypto from 'expo-crypto';

export async function generateInvoiceHash(xml: string): Promise<string> {
  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, xml, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
}
