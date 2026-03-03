/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – UBL 2.1 XML builder (Expo-safe version)      */
/*  Replaces xmlbuilder2 with deterministic string builder            */
/* ------------------------------------------------------------------ */

import { calculateItemAmounts, calculateTotals } from './totals';
import type { Invoice } from './types';

/* ─── Namespace URIs ─── */
const NS = {
  ubl: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  sig: 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2',
  sac: 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2',
  sbc: 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  xades: 'http://uri.etsi.org/01903/v1.3.2#',
} as const;

/* ─── XML Escaper ─── */
function esc(value: string): string {
  return value
    ?.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;') ?? '';
}

/* ====================================================================
 * 1. Build base invoice XML (without UBL Extensions)
 * ==================================================================== */

export function buildInvoiceXML(invoice: Invoice): string {
  const totals = calculateTotals(
    invoice.items,
    invoice.isTaxIncludedInPrice,
    invoice.discount,
  );

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

  /* ── Base tags ── */
  xml += `<cbc:ProfileID>reporting:1.0</cbc:ProfileID>`;
  xml += `<cbc:ID>ACC-SINV-${new Date().getFullYear()}-${esc(invoice.invoiceNumber)}</cbc:ID>`;
  xml += `<cbc:UUID>${esc(invoice.uuid)}</cbc:UUID>`;
  xml += `<cbc:IssueDate>${esc(invoice.issueDate)}</cbc:IssueDate>`;
  xml += `<cbc:IssueTime>${esc(invoice.issueTime)}</cbc:IssueTime>`;
  xml += `<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>`;
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

  /* ── Signature element ── */
  xml += `
  <cac:Signature>
    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>
    <cbc:SignatureMethod>
      urn:oasis:names:specification:ubl:dsig:enveloped:xades
    </cbc:SignatureMethod>
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
  xml += buildAllowanceCharge(invoice, totals.totalTax);

  /* ── TaxTotal ── */
  xml += `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${f(totals.totalTax)}</cbc:TaxAmount>
  </cac:TaxTotal>`;

  xml += buildTaxTotalWithSubtotal(totals.totalTax, totals.subtotal, cur);

  /* ── LegalMonetaryTotal ── */
  xml += buildLegalMonetaryTotal(totals, invoice.discount, cur);

  /* ── InvoiceLines ── */
  xml += buildInvoiceLines(invoice);

  xml += `</Invoice>`;

  return xml;
}

/* ====================================================================
   Everything below remains identical logic but converted to string
   ==================================================================== */

function buildSupplierParty(invoice: Invoice): string {
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
        <cbc:PostalZone>${esc(s.address.postalZone || '000000')}</cbc:PostalZone>
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

function buildCustomerParty(invoice: Invoice): string {
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

function buildAllowanceCharge(invoice: Invoice, totalTax: number): string {
  return `
  <cac:AllowanceCharge>
    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>
    <cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode>
    <cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason>
    <cbc:Amount currencyID="${invoice.currency}">
      ${invoice.discount.toFixed(2)}
    </cbc:Amount>
    <cac:TaxCategory>
      <cbc:ID>S</cbc:ID>
      <cbc:Percent>15.00</cbc:Percent>
      <cac:TaxScheme>
        <cbc:ID>VAT</cbc:ID>
      </cac:TaxScheme>
    </cac:TaxCategory>
  </cac:AllowanceCharge>

  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${invoice.currency}">
      ${totalTax.toFixed(2)}
    </cbc:TaxAmount>
  </cac:TaxTotal>`;
}

function buildTaxTotalWithSubtotal(totalTax: number, subtotal: number, cur: string): string {
  return `
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${cur}">${totalTax.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${cur}">${subtotal.toFixed(2)}</cbc:TaxableAmount>
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

function buildLegalMonetaryTotal(
  totals: ReturnType<typeof calculateTotals>,
  discount: number,
  cur: string,
): string {
  const f = (n: number) => n.toFixed(2);

  return `
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${cur}">${f(totals.subtotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${cur}">${f(totals.subtotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${cur}">${f(totals.totalWithTax)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${cur}">${f(discount)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${cur}">${f(totals.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>`;
}

function buildInvoiceLines(invoice: Invoice): string {
  const cur = invoice.currency;
  const f = (n: number) => n.toFixed(2);

  return invoice.items.map((item, i) => {
    const { lineExtension, tax } =
      calculateItemAmounts(item, invoice.isTaxIncludedInPrice);

    const unitPrice = invoice.isTaxIncludedInPrice
      ? lineExtension / item.quantity
      : item.price;

    return `
    <cac:InvoiceLine>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="${item.unitOfMeasure}">
        ${f(item.quantity)}
      </cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${cur}">
        ${f(lineExtension)}
      </cbc:LineExtensionAmount>

      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${cur}">${f(tax)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="${cur}">
          ${f(lineExtension + tax)}
        </cbc:RoundingAmount>
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
        <cbc:PriceAmount currencyID="${cur}">
          ${f(unitPrice)}
        </cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`;
  }).join('');
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

  const extBlock = `
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionURI>
        urn:oasis:names:specification:ubl:dsig:enveloped:xades
      </ext:ExtensionURI>
      <ext:ExtensionContent>
        <sig:UBLDocumentSignatures>
          <sac:SignatureInformation>
            <cbc:ID>
              urn:oasis:names:specification:ubl:signature:1
            </cbc:ID>
            <sbc:ReferencedSignatureID>
              urn:oasis:names:specification:ubl:signature:Invoice
            </sbc:ReferencedSignatureID>
            ${buildDSSignature(
    invoiceHashBase64,
    signedPropsHash,
    signatureValueBase64,
    certificateBody,
    signingTime,
    certificateDigest,
    issuerName,
    serialNumber
  )}
          </sac:SignatureInformation>
        </sig:UBLDocumentSignatures>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  `;

  return xml.replace(
    /<Invoice[\s\S]*?>/,
    match => match + extBlock
  );
}
function buildDSSignature(
  invoiceHash: string,
  signedPropsHash: string,
  signatureValue: string,
  certificateBody: string,
  signingTime: string,
  certificateDigest: string,
  issuerName: string,
  serialNumber: string,
): string {

  return `
  <ds:Signature Id="signature">

    <ds:SignedInfo>
      <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
      <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>

      <ds:Reference Id="invoiceSignedData" URI="">
        <ds:Transforms>
          <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
            <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>
          </ds:Transform>
          <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
            <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>
          </ds:Transform>
          <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">
            <ds:XPath>
              not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])
            </ds:XPath>
          </ds:Transform>
          <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>
        </ds:Transforms>
        <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <ds:DigestValue>${invoiceHash}</ds:DigestValue>
      </ds:Reference>

      <ds:Reference URI="#xadesSignedProperties"
        Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties">
        <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
        <ds:DigestValue>${signedPropsHash}</ds:DigestValue>
      </ds:Reference>

    </ds:SignedInfo>

    <ds:SignatureValue>${signatureValue}</ds:SignatureValue>

    <ds:KeyInfo>
      <ds:X509Data>
        <ds:X509Certificate>${certificateBody}</ds:X509Certificate>
      </ds:X509Data>
    </ds:KeyInfo>

    <ds:Object>
      <xades:QualifyingProperties Target="signature">
        <xades:SignedProperties Id="xadesSignedProperties">
          <xades:SignedSignatureProperties>

            <xades:SigningTime>${signingTime}</xades:SigningTime>

            <xades:SigningCertificate>
              <xades:Cert>
                <xades:CertDigest>
                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
                  <ds:DigestValue>${certificateDigest}</ds:DigestValue>
                </xades:CertDigest>
                <xades:IssuerSerial>
                  <ds:X509IssuerName>${issuerName}</ds:X509IssuerName>
                  <ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>
                </xades:IssuerSerial>
              </xades:Cert>
            </xades:SigningCertificate>

          </xades:SignedSignatureProperties>
        </xades:SignedProperties>
      </xades:QualifyingProperties>
    </ds:Object>

  </ds:Signature>
  `;
}