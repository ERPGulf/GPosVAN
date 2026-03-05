/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – shared utilities                              */
/*                                                                    */
/*  Replicates C# ZatcaUtils.cs:                                     */
/*    - GetZatcaVersion (phase detection)                             */
/*    - GenerateQrString (Phase 1 simple QR)                          */
/* ------------------------------------------------------------------ */

import { bytesToBase64 } from './certificate';
import { encodeTLV } from './tlv';

/**
 * Determine the ZATCA version from a phase string.
 *
 * C# logic: reads AppSettings.Phase, extracts first digit → returns 1 or 2.
 *
 * @example getZatcaVersion("Phase2") → 2
 * @example getZatcaVersion("Phase1") → 1
 */
export function getZatcaVersion(phaseString: string): number {
  const match = phaseString.match(/\d/);
  return match ? parseInt(match[0], 10) : 1;
}

/**
 * Generate a Phase 1 (simplified) QR string.
 *
 * Phase 1 QR uses only 5 TLV tags — no signatures or hashing.
 *
 * Tags:
 *   1 – Seller name
 *   2 – VAT registration number
 *   3 – Timestamp (yyyy-MM-dd'T'HH:mm:ss)
 *   4 – Invoice total (formatted "0.00")
 *   5 – VAT amount (formatted "0.00")
 */
export function generateSimpleQrString(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  total: string,
  vatAmount: string,
): string {
  const tags: Uint8Array[] = [
    encodeTLV(1, sellerName),
    encodeTLV(2, vatNumber),
    encodeTLV(3, timestamp),
    encodeTLV(4, total),
    encodeTLV(5, vatAmount),
  ];

  const totalLength = tags.reduce((sum, t) => sum + t.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const tag of tags) {
    merged.set(tag, offset);
    offset += tag.length;
  }

  return bytesToBase64(merged);
}
