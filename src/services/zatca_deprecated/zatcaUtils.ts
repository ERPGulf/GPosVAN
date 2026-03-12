import { Buffer } from 'buffer';
import { getTlvForValue } from './qr';

export function getZatcaVersion(phaseString: string): number {
  const match = phaseString.match(/\d/);
  return match ? parseInt(match[0], 10) : 1;
}

export function generateSimpleQrString(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  total: string,
  vatAmount: string,
): string {
  const tags: Buffer[] = [
    getTlvForValue(1, sellerName),
    getTlvForValue(2, vatNumber),
    getTlvForValue(3, timestamp),
    getTlvForValue(4, total),
    getTlvForValue(5, vatAmount),
  ];

  return Buffer.concat(tags).toString('base64');
}

/**
 * Extracts and encodes the structural components of a ZATCA Multi-block PEM file.
 * The ZATCA invoice pipelines expect `certificateBase64` and `privateKeyBase64`.
 *
 * @param fullPemString The raw string content of the PEM file (containing BEGIN PRIVATE KEY, BEGIN CERTIFICATE, etc).
 * @returns Object with the individual base64 encoded strings ready for pipeline ingestion.
 */
export function parseZatcaPem(fullPemString: string): {
  certificateBase64: string;
  privateKeyBase64: string;
} {
  // Regex to match the blocks, accounting for various whitespace or header variations
  const privKeyMatch = fullPemString.match(
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/,
  );
  const certMatch = fullPemString.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/,
  );

  if (!privKeyMatch || !certMatch) {
    throw new Error('Invalid ZATCA PEM format: Missing either Private Key or Certificate block.');
  }

  // The pipeline functions currently expect Base64 representations of these exact string blocks
  return {
    privateKeyBase64: Buffer.from(privKeyMatch[0], 'utf8').toString('base64'),
    certificateBase64: Buffer.from(certMatch[0], 'utf8').toString('base64'),
  };
}
