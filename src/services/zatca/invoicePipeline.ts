import { generateInvoiceHash } from './hash';
import { signHash } from './signer';
import { buildQRPayload } from './qr';
import { Invoice } from './types';
import { buildInvoiceXML } from './XMLHelper';
import { calculateTotals } from './totals';

export async function createInvoicePipeline(invoice: Invoice, privateKey: string) {
  const xml = buildInvoiceXML(invoice);

  const hash = await generateInvoiceHash(xml);

  const signature = signHash(hash, privateKey);

  const totals = calculateTotals(invoice.items);

  const qr = buildQRPayload({
    sellerName: invoice.sellerName,
    vatNumber: invoice.vatNumber,
    timestamp: invoice.timestamp,
    total: totals.total.toFixed(2),
    vat: totals.vat.toFixed(2),
    hash,
    signature,
    publicKey: 'PUBLIC_KEY',
    certHash: 'CERT_HASH',
  });

  return {
    xml,
    hash,
    signature,
    qr,
  };
}
