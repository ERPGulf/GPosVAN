/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – ECDSA signing (secp256k1)                      */
/*                                                                      */
/*  Replicates C# SignHashWithECDSA / SignData logic:                   */
/*    1. Take hex hash string                                           */
/*    2. Encoding.UTF8.GetBytes(hashHex) → UTF-8 bytes                  */
/*    3. SignerUtilities.GetSigner("SHA-256withECDSA")                   */
/*       → internally SHA-256 hashes the input, then ECDSA signs        */
/* ------------------------------------------------------------------ */

import { Buffer } from 'buffer';
import { ec as EC } from 'elliptic';
import * as Crypto from 'expo-crypto';
import { extractECPrivateKeyBytes } from './certificate';
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
  // Convert hex hash string into a UTF-8 Buffer to replicate Node.js `Buffer.from(hashHex, 'utf8')`
  const hashBytes = Buffer.from(hexHash, 'utf8');

  // ECDSA sign the raw string representation (we SHA-256 first internally to mirror SignData)
  const pkBytes = extractECPrivateKeyBytes(privateKeyBase64);
  const key = ec.keyFromPrivate(Array.from(pkBytes));

  // Like Node: crypto.sign('sha256', dataToSign, { key })
  // We hash the exact string with SHA-256 then ECDSA sign
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, hashBytes);

  const sig = key.sign(Array.from(new Uint8Array(digest)));
  const derBytes = Buffer.from(sig.toDER());

  return {
    derBase64: derBytes.toString('base64'),
    rawBytes: new Uint8Array(derBytes),
  };
}
