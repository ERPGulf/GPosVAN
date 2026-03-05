/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – Credit Note / Sales Return UBL 2.1 XML        */
/*                                                                    */
/*  Mirrors XMLHelper.ts but builds InvoiceTypeCode 381 (credit note) */
/*  and adds a BillingReference to the original invoice.              */
/* ------------------------------------------------------------------ */

import { NS } from './constants';
import { calculateTotals } from './totals';
import type { SalesReturnInvoice } from './types';
import {
    buildAllowanceCharge,
    buildCustomerParty,
    buildDSSignature,
    buildInvoiceLines,
    buildLegalMonetaryTotal,
    buildSupplierParty,
    buildTaxTotalWithSubtotal,
    esc,
} from './XMLHelper';

/* ====================================================================
 * Build credit note XML (without UBL Extensions)
 * ==================================================================== */

export function buildSalesReturnXML(invoice: SalesReturnInvoice): string {
  const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
  const f = (n: number) => n.toFixed(2);
  const cur = invoice.currency;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>`;
  xml += `<Invoice
    xmlns="${NS.ubl}"
    xmlns:cac="${NS.cac}"
    xmlns:cbc="${NS.cbc}"
    xmlns:ext="${NS.ext}"
    xmlns:sig="${NS.sig}"
    xmlns:sac="${NS.sac}"
    xmlns:sbc="${NS.sbc}"
    xmlns:ds="${NS.ds}"
    xmlns:xades="${NS.xades}"
  >`;

  /* ── Base tags (type 381 = credit note) ── */
  xml += `<cbc:ProfileID>reporting:1.0</cbc:ProfileID>`;
  xml += `<cbc:ID>ACC-SINV-${new Date().getFullYear()}-${esc(invoice.invoiceNumber)}</cbc:ID>`;
  xml += `<cbc:UUID>${esc(invoice.uuid)}</cbc:UUID>`;
  xml += `<cbc:IssueDate>${esc(invoice.issueDate)}</cbc:IssueDate>`;
  xml += `<cbc:IssueTime>${esc(invoice.issueTime)}</cbc:IssueTime>`;
  xml += `<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>`;
  xml += `<cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`;
  xml += `<cbc:TaxCurrencyCode>${cur}</cbc:TaxCurrencyCode>`;

  /* ── ICV ── */
  const icvNum = invoice.invoiceNumber.replace(/[^0-9]/g, '');
  xml += `
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${esc(icvNum)}</cbc:UUID>
  </cac:AdditionalDocumentReference>`;

  /* ── PIH ── */
  xml += `
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">
        ${esc(invoice.previousInvoiceHash)}
      </cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`;

  /* ── QR Placeholder ── */
  xml += `
  <cac:AdditionalDocumentReference>
    <cbc:ID>QR</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">
        PLACEHOLDER_QR
      </cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>`;

  /* ── Billing Reference (original invoice being returned) ── */
  xml += `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${esc(invoice.billingReferenceId)}</cbc:ID>
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`;

  /* ── Signature element ── */
  xml += `
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>
  </cac:Signature>`;

  /* ── Supplier ── */
  xml += buildSupplierParty(invoice);

  /* ── Customer ── */
  xml += buildCustomerParty(invoice);

  /* ── Delivery ── */
  xml += `
  <cac:Delivery>
    <cbc:ActualDeliveryDate>${esc(invoice.issueDate)}</cbc:ActualDeliveryDate>
  </cac:Delivery>`;

  /* ── PaymentMeans ── */
  xml += `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
  </cac:PaymentMeans>`;

  /* ── AllowanceCharge ── */
  xml += buildAllowanceCharge(invoice);

  /* ── TaxTotal ── */
  xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${f(totals.totalTax)}</cbc:TaxAmount>
  </cac:TaxTotal>`;

  xml += buildTaxTotalWithSubtotal(totals.totalTax, totals.taxableAmount, cur);

  /* ── LegalMonetaryTotal ── */
  xml += buildLegalMonetaryTotal(totals, invoice.discount, cur);

  /* ── InvoiceLines ── */
  xml += buildInvoiceLines(invoice);

  xml += `</Invoice>`;

  return xml;
}

/**
 * Inject the QR base-64 payload into the placeholder.
 */
export function injectSalesReturnQRData(xml: string, qrBase64: string): string {
  return xml.replace('PLACEHOLDER_QR', qrBase64);
}

/**
 * Inject UBL Extensions (digital signature block) into the credit note XML.
 * Identical logic to XMLHelper.injectUBLExtensions.
 */
export function injectSalesReturnUBLExtensions(
  xml: string,
  invoiceHashBase64: string,
  signedPropsHash: string,
  signatureValueBase64: string,
  certificateBody: string,
  signingTime: string,
  certificateDigest: string,
  issuerName: string,
  serialNumber: string,
): string {
  const extBlock = `
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures>
          <sac:SignatureInformation>
            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>
            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>
            ${buildDSSignature(
              invoiceHashBase64,
              signedPropsHash,
              signatureValueBase64,
              certificateBody,
              signingTime,
              certificateDigest,
              issuerName,
              serialNumber,
            )}
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  `;

  return xml.replace(/<Invoice[\s\S]*?>/, (match) => match + extBlock);
}
