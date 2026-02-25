import { ec as EC } from 'elliptic';

const ec = new EC('secp256k1');

export function signHash(hash: string, privateKey: string): string {
  const key = ec.keyFromPrivate(privateKey);

  const signature = key.sign(hash);

  return signature.toDER('hex');
}
