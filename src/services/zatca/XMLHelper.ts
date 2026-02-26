import { create } from 'xmlbuilder2';
import { Invoice, InvoiceItem } from './types';

export function buildInvoiceXML(invoice: Invoice): string {
  const currency = invoice.currency ?? 'SAR';

  const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const vat = subtotal * 0.15;

  const total = subtotal + vat;

  const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('Invoice', {
    xmlns: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
    'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
    'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  });

  // Basic invoice fields

  doc.ele('cbc:ProfileID').txt('reporting:1.0');

  doc.ele('cbc:ID').txt(invoice.invoiceNumber);

  doc.ele('cbc:UUID').txt(invoice.uuid);

  doc.ele('cbc:IssueDate').txt(invoice.issueDate);

  doc.ele('cbc:IssueTime').txt(invoice.issueTime);

  doc.ele('cbc:InvoiceTypeCode').txt('388');

  // Supplier

  const supplier = doc.ele('cac:AccountingSupplierParty');

  const sParty = supplier.ele('cac:Party');

  const sLegal = sParty.ele('cac:PartyLegalEntity');

  sLegal.ele('cbc:RegistrationName').txt(invoice.sellerName);

  // VAT number

  const taxScheme = sParty.ele('cac:PartyTaxScheme');

  taxScheme.ele('cbc:CompanyID').txt(invoice.vatNumber);

  taxScheme.ele('cac:TaxScheme').ele('cbc:ID').txt('VAT');

  // Customer

  const customer = doc.ele('cac:AccountingCustomerParty');

  const cParty = customer.ele('cac:Party');

  const cLegal = cParty.ele('cac:PartyLegalEntity');

  cLegal.ele('cbc:RegistrationName').txt(invoice.customerName ?? '');

  // Invoice lines

  invoice.items.forEach((item, i) => {
    const line = doc.ele('cac:InvoiceLine');

    line.ele('cbc:ID').txt(String(i + 1));

    line.ele('cbc:InvoicedQuantity').txt(String(item.quantity));

    line
      .ele('cbc:LineExtensionAmount', {
        currencyID: currency,
      })
      .txt(String(item.price * item.quantity));

    const taxTotal = line.ele('cac:TaxTotal');

    const itemTax = item.price * item.quantity * 0.15;

    taxTotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(itemTax.toFixed(2));

    const itemNode = line.ele('cac:Item');

    itemNode.ele('cbc:Name').txt(item.name);

    const taxCategory = itemNode.ele('cac:ClassifiedTaxCategory');

    taxCategory.ele('cbc:ID').txt('S');

    taxCategory.ele('cbc:Percent').txt('15');

    taxCategory.ele('cac:TaxScheme').ele('cbc:ID').txt('VAT');

    const price = line.ele('cac:Price');

    price.ele('cbc:PriceAmount', { currencyID: currency }).txt(item.price.toFixed(2));
  });

  // Tax total

  const taxTotal = doc.ele('cac:TaxTotal');

  taxTotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(vat.toFixed(2));

  // Monetary totals

  const monetaryTotal = doc.ele('cac:LegalMonetaryTotal');

  monetaryTotal.ele('cbc:LineExtensionAmount', { currencyID: currency }).txt(subtotal.toFixed(2));

  monetaryTotal.ele('cbc:TaxExclusiveAmount', { currencyID: currency }).txt(subtotal.toFixed(2));

  monetaryTotal.ele('cbc:TaxInclusiveAmount', { currencyID: currency }).txt(total.toFixed(2));

  monetaryTotal.ele('cbc:PayableAmount', { currencyID: currency }).txt(total.toFixed(2));

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
