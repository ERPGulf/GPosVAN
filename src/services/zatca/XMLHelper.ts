import { Invoice, InvoiceItem } from './types';

/**
 * Escape special XML characters in a string.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildInvoiceXML(invoice: Invoice): string {
  const currency = invoice.currency ?? 'SAR';

  const subtotal = invoice.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const vat = subtotal * 0.15;
  const total = subtotal + vat;

  // Build invoice lines
  const invoiceLines = invoice.items
    .map((item, i) => {
      const lineTotal = item.price * item.quantity;
      const itemTax = lineTotal * 0.15;
      return (
        `<cac:InvoiceLine>` +
        `<cbc:ID>${i + 1}</cbc:ID>` +
        `<cbc:InvoicedQuantity>${item.quantity}</cbc:InvoicedQuantity>` +
        `<cbc:LineExtensionAmount currencyID="${currency}">${lineTotal}</cbc:LineExtensionAmount>` +
        `<cac:TaxTotal>` +
        `<cbc:TaxAmount currencyID="${currency}">${itemTax.toFixed(2)}</cbc:TaxAmount>` +
        `</cac:TaxTotal>` +
        `<cac:Item>` +
        `<cbc:Name>${escapeXml(item.name)}</cbc:Name>` +
        `<cac:ClassifiedTaxCategory>` +
        `<cbc:ID>S</cbc:ID>` +
        `<cbc:Percent>15</cbc:Percent>` +
        `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>` +
        `</cac:ClassifiedTaxCategory>` +
        `</cac:Item>` +
        `<cac:Price>` +
        `<cbc:PriceAmount currencyID="${currency}">${item.price.toFixed(2)}</cbc:PriceAmount>` +
        `</cac:Price>` +
        `</cac:InvoiceLine>`
      );
    })
    .join('');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"` +
    ` xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"` +
    ` xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"` +
    ` xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">` +
    `<cbc:ProfileID>reporting:1.0</cbc:ProfileID>` +
    `<cbc:ID>${escapeXml(invoice.invoiceNumber)}</cbc:ID>` +
    `<cbc:UUID>${escapeXml(invoice.uuid)}</cbc:UUID>` +
    `<cbc:IssueDate>${escapeXml(invoice.issueDate)}</cbc:IssueDate>` +
    `<cbc:IssueTime>${escapeXml(invoice.issueTime)}</cbc:IssueTime>` +
    `<cbc:InvoiceTypeCode>388</cbc:InvoiceTypeCode>` +
    // Supplier
    `<cac:AccountingSupplierParty>` +
    `<cac:Party>` +
    `<cac:PartyLegalEntity>` +
    `<cbc:RegistrationName>${escapeXml(invoice.sellerName)}</cbc:RegistrationName>` +
    `</cac:PartyLegalEntity>` +
    `<cac:PartyTaxScheme>` +
    `<cbc:CompanyID>${escapeXml(invoice.vatNumber)}</cbc:CompanyID>` +
    `<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>` +
    `</cac:PartyTaxScheme>` +
    `</cac:Party>` +
    `</cac:AccountingSupplierParty>` +
    // Customer
    `<cac:AccountingCustomerParty>` +
    `<cac:Party>` +
    `<cac:PartyLegalEntity>` +
    `<cbc:RegistrationName>${escapeXml(invoice.customerName ?? '')}</cbc:RegistrationName>` +
    `</cac:PartyLegalEntity>` +
    `</cac:Party>` +
    `</cac:AccountingCustomerParty>` +
    // Invoice lines
    invoiceLines +
    // Tax total
    `<cac:TaxTotal>` +
    `<cbc:TaxAmount currencyID="${currency}">${vat.toFixed(2)}</cbc:TaxAmount>` +
    `</cac:TaxTotal>` +
    // Monetary totals
    `<cac:LegalMonetaryTotal>` +
    `<cbc:LineExtensionAmount currencyID="${currency}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>` +
    `<cbc:TaxExclusiveAmount currencyID="${currency}">${subtotal.toFixed(2)}</cbc:TaxExclusiveAmount>` +
    `<cbc:TaxInclusiveAmount currencyID="${currency}">${total.toFixed(2)}</cbc:TaxInclusiveAmount>` +
    `<cbc:PayableAmount currencyID="${currency}">${total.toFixed(2)}</cbc:PayableAmount>` +
    `</cac:LegalMonetaryTotal>` +
    `</Invoice>`;

  return xml;
}

export function calculateTotals(items: InvoiceItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const vat = subtotal * 0.15;

  return {
    total: subtotal + vat,
    vat,
  };
}
