/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – UBL 2.1 XML builder (Expo-safe version)      */
/*  Replaces xmlbuilder2 with deterministic string builder            */
/* ------------------------------------------------------------------ */

import { INVOICE_SUBTYPE, NS } from './constants';
import { calculateItemAmounts, calculateTotals } from './totals';
import type { Invoice } from './types';

/* ─── XML Escaper ─── */
export function esc(value: string): string {
  return (
    value
      ?.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;') ?? ''
  );
}

/* ====================================================================
 * 1. Build base invoice XML (without UBL Extensions)
 * ==================================================================== */

export function buildInvoiceXML(invoice: Invoice): string {
  const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);

  const f = (n: number) => n.toFixed(2);
  const cur = invoice.currency;

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<Invoice xmlns="${NS.ubl}" xmlns:cac="${NS.cac}" xmlns:cbc="${NS.cbc}" xmlns:ext="${NS.ext}">`;

  const invoiceSubtype = invoice.invoiceSubtype ?? INVOICE_SUBTYPE;

  /* ── Base tags ── */
  xml += `\n  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>`;
  xml += `\n  <cbc:ID>ACC-SINV-${new Date().getFullYear()}-${esc(invoice.invoiceNumber)}</cbc:ID>`;
  xml += `\n  <cbc:UUID>${esc(invoice.uuid)}</cbc:UUID>`;
  xml += `\n  <cbc:IssueDate>${esc(invoice.issueDate)}</cbc:IssueDate>`;
  xml += `\n  <cbc:IssueTime>${esc(invoice.issueTime)}</cbc:IssueTime>`;
  xml += `\n  <cbc:InvoiceTypeCode name="${invoiceSubtype}">388</cbc:InvoiceTypeCode>`;
  xml += `\n  <cbc:DocumentCurrencyCode>${cur}</cbc:DocumentCurrencyCode>`;
  xml += `\n  <cbc:TaxCurrencyCode>${cur}</cbc:TaxCurrencyCode>`;

  /* ── ICV ── */
  const icvNum = invoice.invoiceNumber.replace(/[^0-9]/g, '');
  xml += `
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${esc(icvNum)}</cbc:UUID>
  </cac:AdditionalDocumentReference>`;

  /* ── PIH ── */
  xml += `\n  <cac:AdditionalDocumentReference>`;
  xml += `\n    <cbc:ID>PIH</cbc:ID>`;
  xml += `\n    <cac:Attachment>`;
  xml += `\n      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${esc(invoice.previousInvoiceHash)}</cbc:EmbeddedDocumentBinaryObject>`;
  xml += `\n    </cac:Attachment>`;
  xml += `\n  </cac:AdditionalDocumentReference>`;

  /* ── QR Placeholder ── */
  xml += `\n  <cac:AdditionalDocumentReference>`;
  xml += `\n    <cbc:ID>QR</cbc:ID>`;
  xml += `\n    <cac:Attachment>`;
  xml += `\n      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">PLACEHOLDER_QR</cbc:EmbeddedDocumentBinaryObject>`;
  xml += `\n    </cac:Attachment>`;
  xml += `\n  </cac:AdditionalDocumentReference>`;

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

  /* ── TaxTotal (1st: just TaxAmount) ── */
  xml += `\n  <cac:TaxTotal>`;
  xml += `\n    <cbc:TaxAmount currencyID="${cur}">${f(totals.totalTax)}</cbc:TaxAmount>`;
  xml += `\n  </cac:TaxTotal>`;

  /* ── TaxTotal (2nd: TaxAmount + TaxSubtotal) ── */
  xml += buildTaxTotalWithSubtotal(totals.totalTax, totals.taxableAmount, cur);

  /* ── LegalMonetaryTotal ── */
  xml += buildLegalMonetaryTotal(totals, invoice.discount, cur);

  /* ── InvoiceLines ── */
  xml += buildInvoiceLines(invoice);

  xml += `\n</Invoice>`;

  return xml;
}

/* ====================================================================
   Everything below remains identical logic but converted to string
   ==================================================================== */

export function buildSupplierParty(invoice: Invoice): string {
  const s = invoice.supplier;

  return `
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="CRN">${esc(s.companyRegistrationNo)}</cbc:ID>
      </cac:PartyIdentification>

      <cac:PostalAddress>
        <cbc:StreetName>${esc(s.address.street)}</cbc:StreetName>
        <cbc:BuildingNumber>${esc(s.address.buildingNumber || '0')}</cbc:BuildingNumber>
        <cbc:PlotIdentification>${esc(s.address.plotIdentification)}</cbc:PlotIdentification>
        <cbc:CitySubdivisionName>${esc(s.address.citySubdivision)}</cbc:CitySubdivisionName>
        <cbc:CityName>${esc(s.address.city)}</cbc:CityName>
        <cbc:PostalZone>${esc((s.address.postalZone || '00000').substring(0, 5))}</cbc:PostalZone>
        <cbc:CountrySubentity>${esc(s.address.countrySubentity)}</cbc:CountrySubentity>
        <cac:Country>
          <cbc:IdentificationCode>${esc(s.address.countryCode)}</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>

      <cac:PartyTaxScheme>
        <cbc:CompanyID>${esc(s.vatNumber)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>

      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(s.registrationName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>`;
}

export function buildCustomerParty(invoice: Invoice): string {
  const c = invoice.customer;

  return `
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>

      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${esc(c.registrationName)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>`;
}

export function buildAllowanceCharge(invoice: Invoice): string {
  const discountAmount = (invoice.discount ?? 0).toFixed(2);
  return `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode>
    <cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="${invoice.currency}">${discountAmount}</cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>15.00</cbc:Percent>
      <cac:TaxScheme>
        <cbc:ID>VAT</cbc:ID>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>`;
}

export function buildTaxTotalWithSubtotal(
  totalTax: number,
  taxableAmount: number,
  cur: string,
): string {
  return `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${totalTax.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${taxableAmount.toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${cur}">${totalTax.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>15.00</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>`;
}

export function buildLegalMonetaryTotal(
  totals: ReturnType<typeof calculateTotals>,
  discount: number,
  cur: string,
): string {
  const f = (n: number) => n.toFixed(2);

  return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${f(totals.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${f(totals.taxableAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${f(totals.totalWithTax)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${cur}">${f(discount)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${cur}">${f(totals.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
}

export function buildInvoiceLines(invoice: Invoice): string {
  const cur = invoice.currency;
  const f = (n: number) => n.toFixed(2);

  return invoice.items
    .map((item, i) => {
      const { lineExtension, tax } = calculateItemAmounts(item, invoice.isTaxIncludedInPrice);

      const unitPrice = invoice.isTaxIncludedInPrice ? lineExtension / item.quantity : item.price;

      return `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${item.unitOfMeasure}">${f(item.quantity)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${cur}">${f(lineExtension)}</cbc:LineExtensionAmount>

      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${cur}">${f(tax)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="${cur}">${f(lineExtension + tax)}</cbc:RoundingAmount>
      </cac:TaxTotal>

      <cac:Item>
        <cbc:Name>${esc(item.name)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>15.00</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>

      <cac:Price>
        <cbc:PriceAmount currencyID="${cur}">${f(unitPrice)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
    })
    .join('');
}
export function injectQRData(xml: string, qrBase64: string): string {
  return xml.replace('PLACEHOLDER_QR', qrBase64);
}
export function injectUBLExtensions(
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
  const dsSignature = buildDSSignature(
    invoiceHashBase64,
    signedPropsHash,
    signatureValueBase64,
    certificateBody,
    signingTime,
    certificateDigest,
    issuerName,
    serialNumber,
  );

  // Build the UBL extensions block matching the cleared XML indentation exactly
  let ext = '';
  ext += `\n<ext:UBLExtensions>`;
  ext += `\n    <ext:UBLExtension>`;
  ext += `\n        <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>`;
  ext += `\n        <ext:ExtensionContent>`;
  ext += `\n            <sig:UBLDocumentSignatures xmlns:sig="${NS.sig}" xmlns:sac="${NS.sac}" xmlns:sbc="${NS.sbc}">`;
  ext += `\n                <sac:SignatureInformation>`;
  ext += `\n                    <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>`;
  ext += `\n                    <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>`;
  ext += `\n                    ${dsSignature}`;
  ext += `\n                </sac:SignatureInformation>`;
  ext += `\n            </sig:UBLDocumentSignatures>`;
  ext += `\n        </ext:ExtensionContent>`;
  ext += `\n    </ext:UBLExtension>`;
  ext += `\n</ext:UBLExtensions>`;

  return xml.replace(/<Invoice[\s\S]*?>/, (match) => match + ext);
}

export function buildDSSignature(
  invoiceHash: string,
  signedPropsHash: string,
  signatureValue: string,
  certificateBody: string,
  signingTime: string,
  certificateDigest: string,
  issuerName: string,
  serialNumber: string,
): string {
  let sig = '';
  sig += `<ds:Signature xmlns:ds="${NS.ds}" Id="signature">`;
  sig += `\n                        <ds:SignedInfo>`;
  sig += `\n                            <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>`;
  sig += `\n                            <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>`;
  sig += `\n                            <ds:Reference Id="invoiceSignedData" URI="">`;
  sig += `\n                                <ds:Transforms>`;
  sig += `\n                                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">`;
  sig += `\n                                        <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>`;
  sig += `\n                                    </ds:Transform>`;
  sig += `\n                                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">`;
  sig += `\n                                        <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>`;
  sig += `\n                                    </ds:Transform>`;
  sig += `\n                                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">`;
  sig += `\n                                        <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>`;
  sig += `\n                                    </ds:Transform>`;
  sig += `\n                                    <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>`;
  sig += `\n                                </ds:Transforms>`;
  sig += `\n                                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`;
  sig += `\n                                <ds:DigestValue>${invoiceHash}</ds:DigestValue>`;
  sig += `\n                            </ds:Reference>`;
  sig += `\n                            <ds:Reference Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties" URI="#xadesSignedProperties">`;
  sig += `\n                                <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`;
  sig += `\n                                <ds:DigestValue>${signedPropsHash}</ds:DigestValue>`;
  sig += `\n                            </ds:Reference>`;
  sig += `\n                        </ds:SignedInfo>`;
  sig += `\n                        <ds:SignatureValue>${signatureValue}</ds:SignatureValue>`;
  sig += `\n                        <ds:KeyInfo>`;
  sig += `\n                            <ds:X509Data>`;
  sig += `\n                                <ds:X509Certificate>${certificateBody}</ds:X509Certificate>`;
  sig += `\n                            </ds:X509Data>`;
  sig += `\n                        </ds:KeyInfo>`;
  sig += `\n                        <ds:Object>`;
  sig += `\n                            <xades:QualifyingProperties xmlns:xades="${NS.xades}" Target="signature">`;
  sig += `\n                                <xades:SignedProperties Id="xadesSignedProperties">`;
  sig += `\n                                    <xades:SignedSignatureProperties>`;
  sig += `\n                                        <xades:SigningTime>${signingTime}</xades:SigningTime>`;
  sig += `\n                                        <xades:SigningCertificate>`;
  sig += `\n                                            <xades:Cert>`;
  sig += `\n                                                <xades:CertDigest>`;
  sig += `\n                                                    <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>`;
  sig += `\n                                                    <ds:DigestValue>${certificateDigest}</ds:DigestValue>`;
  sig += `\n                                                </xades:CertDigest>`;
  sig += `\n                                                <xades:IssuerSerial>`;
  sig += `\n                                                    <ds:X509IssuerName>${issuerName}</ds:X509IssuerName>`;
  sig += `\n                                                    <ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>`;
  sig += `\n                                                </xades:IssuerSerial>`;
  sig += `\n                                            </xades:Cert>`;
  sig += `\n                                        </xades:SigningCertificate>`;
  sig += `\n                                    </xades:SignedSignatureProperties>`;
  sig += `\n                                </xades:SignedProperties>`;
  sig += `\n                            </xades:QualifyingProperties>`;
  sig += `\n                        </ds:Object>`;
  sig += `\n                    </ds:Signature>`;
  return sig;
}
