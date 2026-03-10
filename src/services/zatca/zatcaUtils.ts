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
