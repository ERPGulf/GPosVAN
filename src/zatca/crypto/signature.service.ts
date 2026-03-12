import elliptic from 'elliptic';

const ec = new elliptic.ec('secp256k1');

export function signInvoiceHash(hash: string, privateKey: string) {
  const key = ec.keyFromPrivate(privateKey, 'hex');

  const signature = key.sign(hash);

  return Buffer.from(signature.toDER()).toString('base64');
}
