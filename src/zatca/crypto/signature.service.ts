import elliptic from 'elliptic';
import { Buffer } from 'buffer';

const ec = new elliptic.ec('p256');

export function signInvoiceHash(hashBase64: string, privateKeyHex: string) {
  if (!hashBase64) {
    throw new Error('Missing invoice hash');
  }

  if (!privateKeyHex) {
    throw new Error('Missing private key');
  }

  /*
  Convert Base64 hash → bytes
  */

  const hashBytes = Buffer.from(hashBase64, 'base64');

  /*
  Load EC private key
  */

  const key = ec.keyFromPrivate(privateKeyHex, 'hex');

  /*
  Sign hash
  */

  const signature = key.sign(hashBytes, { canonical: true });

  /*
  DER → Base64
  */

  return Buffer.from(signature.toDER()).toString('base64');
}
