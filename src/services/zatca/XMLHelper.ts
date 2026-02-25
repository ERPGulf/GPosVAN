import { create } from 'xmlbuilder2';
import { Invoice, InvoiceItem } from './types';

export function buildInvoiceXML(invoice: Invoice): string {
  const doc = create({ version: '1.0' }).ele('Invoice');

  doc.ele('cbc:ID').txt(invoice.invoiceNumber);

  doc.ele('cbc:IssueDate').txt(invoice.timestamp);

  const supplier = doc.ele('cac:AccountingSupplierParty');

  supplier.ele('cbc:RegistrationName').txt(invoice.sellerName);

  const lines = doc.ele('cac:InvoiceLines');

  invoice.items.forEach((item, i) => {
    const line = lines.ele('cac:InvoiceLine');

    line.ele('cbc:ID').txt(String(i + 1));

    line.ele('cbc:InvoicedQuantity').txt(String(item.quantity));

    line.ele('cbc:LineExtensionAmount').txt(String(item.price));

    line.ele('cbc:Name').txt(item.name);
  });

  return doc.end({ prettyPrint: false });
}
export function calculateTotals(items: InvoiceItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const vat = subtotal * 0.15;

  return {
    total: subtotal + vat,
    vat,
  };
}
