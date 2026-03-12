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
import * as Crypto from 'expo-crypto';
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
  if (__DEV__) console.log('[ZATCA] signHash: hashing hex stream...');

  // Step 1+2: SHA-256 hash the hex hash string
  // (C#: Encoding.UTF8.GetBytes(hashHex) → SHA-256withECDSA internally hashes)
  // Using digestStringAsync to avoid Hermes TypedArray compatibility issues
  const hashHex2 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, hexHash, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

  // Convert hex hash result to bytes for ECDSA signing
  const hashBytes = new Uint8Array(
    (hashHex2.match(/.{2}/g) || []).map((byte) => parseInt(byte, 16)),
  );

  // Step 3: ECDSA sign the SHA-256 result
  const pkBytes = extractECPrivateKey(new TextDecoder().decode(base64ToBytes(privateKeyBase64)));
  const key = ec.keyFromPrivate(Array.from(pkBytes));

  if (__DEV__) console.log('[ZATCA] signHash: performing ECDSA signature (secp256k1)...');
  const sig = key.sign(Array.from(hashBytes));
  const derBytes = new Uint8Array(sig.toDER());

  const derBase64 = bytesToBase64(derBytes);
  if (__DEV__) console.log('[ZATCA] signHash: success.');

  return {
    derBase64,
    rawBytes: derBytes,
  };
}
