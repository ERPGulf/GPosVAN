/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – ECDSA signing (secp256r1 / P-256)             */
/* ------------------------------------------------------------------ */

import { ec as EC } from 'elliptic';
import { base64ToBytes, bytesToBase64 } from './certificate';

// ZATCA mandates ECDSA with P-256 (secp256r1), NOT secp256k1
const ec = new EC('p256');

/**
 * Sign a SHA-256 hash (hex string) with the ECDSA private key.
 *
 * Returns:
 *  - `derBase64`: base-64 of the DER-encoded signature (for XML SignatureValue)
 *  - `rawBytes`:  raw signature bytes (for QR tag 7)
 */
export function signHash(
  hashHex: string,
  privateKeyBase64: string,
): { derBase64: string; rawBytes: Uint8Array } {
  const pkBytes = base64ToBytes(privateKeyBase64);
  const key = ec.keyFromPrivate(Array.from(pkBytes));

  const sig = key.sign(hashHex, 'hex');
  const derArray = sig.toDER(); // number[]

  const derBytes = new Uint8Array(derArray);
  return {
    derBase64: bytesToBase64(derBytes),
    rawBytes: derBytes,
  };
}
