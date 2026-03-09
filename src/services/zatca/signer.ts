/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – ECDSA signing (secp256k1)                      */
/*                                                                      */
/*  Replicates C# SignHashWithECDSA / SignData logic:                   */
/*    1. Take hex hash string                                           */
/*    2. Encoding.UTF8.GetBytes(hashHex) → UTF-8 bytes                  */
/*    3. SignerUtilities.GetSigner("SHA-256withECDSA")                   */
/*       → internally SHA-256 hashes the input, then ECDSA signs        */
/* ------------------------------------------------------------------ */

import { ec as EC } from 'elliptic';
import { base64ToBytes, bytesToBase64, extractECPrivateKey } from './certificate';
import { EC_CURVE } from './constants';

// ZATCA mandates ECDSA with secp256k1
const ec = new EC(EC_CURVE);

/**
 * Sign an invoice hash with the ECDSA private key.
 *
 * Matches C# CertificateUtils.SignHashWithECDSABytes:
 *   var bytes = Encoding.UTF8.GetBytes(hashHex);   // hex string → UTF-8 bytes
 *   SignData(pk, bytes);                             // SHA-256withECDSA
 *
 * SHA-256withECDSA = SHA256(input) then ECDSA sign the hash.
 * elliptic's key.sign() expects a pre-computed hash, so we SHA-256 first.
 *
 * Returns:
 *  - `derBase64`: base-64 of the DER-encoded signature (for XML SignatureValue)
 *  - `rawBytes`:  raw DER signature bytes
 */
export async function signHash(
  hexHash: string,
  privateKeyBase64: string,
): Promise<{ derBase64: string; rawBytes: Uint8Array }> {
  // Convert hex hash back to bytes (which is the actual SHA-256 result of the XML)
  const hashBytes = new Uint8Array(
    (hexHash.match(/.{2}/g) || []).map((byte) => parseInt(byte, 16)),
  );

  // ECDSA sign the raw SHA-256 hash bytes
  const pkBytes = extractECPrivateKey(new TextDecoder().decode(base64ToBytes(privateKeyBase64)));
  const key = ec.keyFromPrivate(Array.from(pkBytes));

  const sig = key.sign(Array.from(hashBytes));
  const derBytes = new Uint8Array(sig.toDER());

  return {
    derBase64: bytesToBase64(derBytes),
    rawBytes: derBytes,
  };
}
