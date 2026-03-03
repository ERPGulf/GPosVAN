/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – UBL 2.1 XML builder using xmlbuilder2         */
/*                                                                    */
/*  Mirrors the C# XMLHelper: generates a ZATCA Phase-2 compliant    */
/*  Invoice XML with all required elements.                           */
/* ------------------------------------------------------------------ */

import { create } from 'xmlbuilder2';
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

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele(NS.ubl, 'Invoice')
    .att('xmlns', NS.ubl)
    .att('xmlns:cac', NS.cac)
    .att('xmlns:cbc', NS.cbc)
    .att('xmlns:ext', NS.ext);

  /* ── Base tags ── */
  doc.ele(NS.cbc, 'cbc:ProfileID').txt('reporting:1.0').up();
  doc.ele(NS.cbc, 'cbc:ID').txt('ACC-SINV-' + new Date().getFullYear() + '-' + invoice.invoiceNumber).up();
  doc.ele(NS.cbc, 'cbc:UUID').txt(invoice.uuid).up();
  doc.ele(NS.cbc, 'cbc:IssueDate').txt(invoice.issueDate).up();
  doc.ele(NS.cbc, 'cbc:IssueTime').txt(invoice.issueTime).up();
  doc.ele(NS.cbc, 'cbc:InvoiceTypeCode').att('name', '0200000').txt('388').up();
  doc.ele(NS.cbc, 'cbc:DocumentCurrencyCode').txt(cur).up();
  doc.ele(NS.cbc, 'cbc:TaxCurrencyCode').txt(cur).up();

  /* ── AdditionalDocumentReference – ICV ── */
  const icvRef = doc.ele(NS.cac, 'cac:AdditionalDocumentReference');
  icvRef.ele(NS.cbc, 'cbc:ID').txt('ICV').up();
  const icvNum = invoice.invoiceNumber.replace(/[^0-9]/g, '');
  icvRef.ele(NS.cbc, 'cbc:UUID').txt(icvNum).up();
  icvRef.up();

  /* ── AdditionalDocumentReference – PIH ── */
  const pihRef = doc.ele(NS.cac, 'cac:AdditionalDocumentReference');
  pihRef.ele(NS.cbc, 'cbc:ID').txt('PIH').up();
  const pihAtt = pihRef.ele(NS.cac, 'cac:Attachment');
  pihAtt.ele(NS.cbc, 'cbc:EmbeddedDocumentBinaryObject')
    .att('mimeCode', 'text/plain')
    .txt(invoice.previousInvoiceHash)
    .up();
  pihAtt.up();
  pihRef.up();

  /* ── AdditionalDocumentReference – QR (placeholder) ── */
  const qrRef = doc.ele(NS.cac, 'cac:AdditionalDocumentReference');
  qrRef.ele(NS.cbc, 'cbc:ID').txt('QR').up();
  const qrAtt = qrRef.ele(NS.cac, 'cac:Attachment');
  qrAtt.ele(NS.cbc, 'cbc:EmbeddedDocumentBinaryObject')
    .att('mimeCode', 'text/plain')
    .txt('PLACEHOLDER_QR')
    .up();
  qrAtt.up();
  qrRef.up();

  /* ── Signature element ── */
  const sigEle = doc.ele(NS.cac, 'cac:Signature');
  sigEle.ele(NS.cbc, 'cbc:ID').txt('urn:oasis:names:specification:ubl:signature:Invoice').up();
  sigEle.ele(NS.cbc, 'cbc:SignatureMethod').txt('urn:oasis:names:specification:ubl:dsig:enveloped:xades').up();
  sigEle.up();

  /* ── AccountingSupplierParty ── */
  buildSupplierParty(doc, invoice);

  /* ── AccountingCustomerParty ── */
  buildCustomerParty(doc, invoice);

  /* ── Delivery ── */
  const delivery = doc.ele(NS.cac, 'cac:Delivery');
  delivery.ele(NS.cbc, 'cbc:ActualDeliveryDate').txt(invoice.issueDate).up();
  delivery.up();

  /* ── PaymentMeans ── */
  const payment = doc.ele(NS.cac, 'cac:PaymentMeans');
  payment.ele(NS.cbc, 'cbc:PaymentMeansCode').txt('30').up();
  payment.up();

  /* ── AllowanceCharge (document-level discount) ── */
  buildAllowanceCharge(doc, invoice, totals.totalTax);

  /* ── TaxTotal (simple – just amount) ── */
  const taxTotal1 = doc.ele(NS.cac, 'cac:TaxTotal');
  taxTotal1.ele(NS.cbc, 'cbc:TaxAmount').att('currencyID', cur).txt(f(totals.totalTax)).up();
  taxTotal1.up();

  /* ── TaxTotal (with subtotal breakdown) ── */
  buildTaxTotalWithSubtotal(doc, totals.totalTax, totals.subtotal, cur);

  /* ── LegalMonetaryTotal ── */
  buildLegalMonetaryTotal(doc, totals, invoice.discount, cur);

  /* ── InvoiceLines ── */
  buildInvoiceLines(doc, invoice);

  return doc.end({ prettyPrint: false });
}

/* ====================================================================
 * 2. Inject UBL Extensions (signature data) into existing XML
 * ==================================================================== */

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
  // Build the UBL extension block as a string and inject it
  const ext =
    `<ext:UBLExtensions>` +
    `<ext:UBLExtension>` +
    `<ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>` +
    `<ext:ExtensionContent>` +
    `<sig:UBLDocumentSignatures xmlns:sig="${NS.sig}" xmlns:sac="${NS.sac}" xmlns:sbc="${NS.sbc}">` +
    `<sac:SignatureInformation>` +
    `<cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>` +
    `<sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>` +
    buildDSSignature(
      invoiceHashBase64,
      signedPropsHash,
      signatureValueBase64,
      certificateBody,
      signingTime,
      certificateDigest,
      issuerName,
      serialNumber,
    ) +
    `</sac:SignatureInformation>` +
    `</sig:UBLDocumentSignatures>` +
    `</ext:ExtensionContent>` +
    `</ext:UBLExtension>` +
    `</ext:UBLExtensions>`;

  // Insert right after <Invoice ...> opening tag
  const insertPoint = xml.indexOf('>') + 1; // end of <Invoice ...>
  return xml.slice(0, insertPoint) + ext + xml.slice(insertPoint);
}

/* ====================================================================
 * 3. Inject QR data – replace the placeholder
 * ==================================================================== */

export function injectQRData(xml: string, qrBase64: string): string {
  return xml.replace('PLACEHOLDER_QR', qrBase64);
}

/* ====================================================================
 * Helper: ds:Signature XML block
 * ==================================================================== */

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
  return (
    `<ds:Signature xmlns:ds="${NS.ds}" Id="signature">` +

    /* ── SignedInfo ── */
    `<ds:SignedInfo>` +
    `<ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>` +
    `<ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>` +

    // Reference 1 – invoice body
    `<ds:Reference Id="invoiceSignedData" URI="">` +
    `<ds:Transforms>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
    `<ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>` +
    `</ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
    `<ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>` +
    `</ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
    `<ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>` +
    `</ds:Transform>` +
    `<ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>` +
    `</ds:Transforms>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${invoiceHash}</ds:DigestValue>` +
    `</ds:Reference>` +

    // Reference 2 – signed properties
    `<ds:Reference URI="#xadesSignedProperties" Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties">` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${signedPropsHash}</ds:DigestValue>` +
    `</ds:Reference>` +

    `</ds:SignedInfo>` +

    /* ── SignatureValue ── */
    `<ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +

    /* ── KeyInfo ── */
    `<ds:KeyInfo>` +
    `<ds:X509Data>` +
    `<ds:X509Certificate>${certificateBody}</ds:X509Certificate>` +
    `</ds:X509Data>` +
    `</ds:KeyInfo>` +

    /* ── Object – xades:QualifyingProperties ── */
    `<ds:Object>` +
    `<xades:QualifyingProperties xmlns:xades="${NS.xades}" Target="signature">` +
    `<xades:SignedProperties Id="xadesSignedProperties">` +
    `<xades:SignedSignatureProperties>` +
    `<xades:SigningTime>${signingTime}</xades:SigningTime>` +
    `<xades:SigningCertificate>` +
    `<xades:Cert>` +
    `<xades:CertDigest>` +
    `<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `<ds:DigestValue>${certificateDigest}</ds:DigestValue>` +
    `</xades:CertDigest>` +
    `<xades:IssuerSerial>` +
    `<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>` +
    `<ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>` +
    `</xades:IssuerSerial>` +
    `</xades:Cert>` +
    `</xades:SigningCertificate>` +
    `</xades:SignedSignatureProperties>` +
    `</xades:SignedProperties>` +
    `</xades:QualifyingProperties>` +
    `</ds:Object>` +

    `</ds:Signature>`
  );
}

/* ====================================================================
 * Sub-builders (match C# helper methods)
 * ==================================================================== */

function buildSupplierParty(doc: any, invoice: Invoice) {
  const s = invoice.supplier;
  const sp = doc.ele(NS.cac, 'cac:AccountingSupplierParty');
  const party = sp.ele(NS.cac, 'cac:Party');

  // PartyIdentification
  const pid = party.ele(NS.cac, 'cac:PartyIdentification');
  pid.ele(NS.cbc, 'cbc:ID').att('schemeID', 'CRN').txt(s.companyRegistrationNo).up();
  pid.up();

  // PostalAddress
  const addr = party.ele(NS.cac, 'cac:PostalAddress');
  addr.ele(NS.cbc, 'cbc:StreetName').txt(s.address.street).up();
  addr.ele(NS.cbc, 'cbc:BuildingNumber').txt(s.address.buildingNumber || '0').up();
  addr.ele(NS.cbc, 'cbc:PlotIdentification').txt(s.address.plotIdentification).up();
  addr.ele(NS.cbc, 'cbc:CitySubdivisionName').txt(s.address.citySubdivision).up();
  addr.ele(NS.cbc, 'cbc:CityName').txt(s.address.city).up();
  addr.ele(NS.cbc, 'cbc:PostalZone').txt(s.address.postalZone || '000000').up();
  addr.ele(NS.cbc, 'cbc:CountrySubentity').txt(s.address.countrySubentity).up();
  const country = addr.ele(NS.cac, 'cac:Country');
  country.ele(NS.cbc, 'cbc:IdentificationCode').txt(s.address.countryCode).up();
  country.up();
  addr.up();

  // PartyTaxScheme
  const pts = party.ele(NS.cac, 'cac:PartyTaxScheme');
  pts.ele(NS.cbc, 'cbc:CompanyID').txt(s.vatNumber).up();
  const ts = pts.ele(NS.cac, 'cac:TaxScheme');
  ts.ele(NS.cbc, 'cbc:ID').txt('VAT').up();
  ts.up();
  pts.up();

  // PartyLegalEntity
  const ple = party.ele(NS.cac, 'cac:PartyLegalEntity');
  ple.ele(NS.cbc, 'cbc:RegistrationName').txt(s.registrationName).up();
  ple.up();

  party.up();
  sp.up();
}

function buildCustomerParty(doc: any, invoice: Invoice) {
  const c = invoice.customer;
  const cp = doc.ele(NS.cac, 'cac:AccountingCustomerParty');
  const party = cp.ele(NS.cac, 'cac:Party');

  // PartyTaxScheme
  const pts = party.ele(NS.cac, 'cac:PartyTaxScheme');
  const ts = pts.ele(NS.cac, 'cac:TaxScheme');
  ts.ele(NS.cbc, 'cbc:ID').txt('VAT').up();
  ts.up();
  pts.up();

  // PartyLegalEntity
  const ple = party.ele(NS.cac, 'cac:PartyLegalEntity');
  ple.ele(NS.cbc, 'cbc:RegistrationName').txt(c.registrationName).up();
  ple.up();

  party.up();
  cp.up();
}

function buildAllowanceCharge(doc: any, invoice: Invoice, totalTax: number) {
  const ac = doc.ele(NS.cac, 'cac:AllowanceCharge');
  ac.ele(NS.cbc, 'cbc:ChargeIndicator').txt('false').up();
  ac.ele(NS.cbc, 'cbc:AllowanceChargeReasonCode').txt('95').up();
  ac.ele(NS.cbc, 'cbc:AllowanceChargeReason').txt('Discount').up();
  ac.ele(NS.cbc, 'cbc:Amount').att('currencyID', invoice.currency).txt(invoice.discount.toFixed(2)).up();

  const tc = ac.ele(NS.cac, 'cac:TaxCategory');
  tc.ele(NS.cbc, 'cbc:ID').txt(invoice.discount > 0 ? 'Z' : 'S').up();
  tc.ele(NS.cbc, 'cbc:Percent').txt('15.00').up();
  const scheme = tc.ele(NS.cac, 'cac:TaxScheme');
  scheme.ele(NS.cbc, 'cbc:ID').txt('VAT').up();
  scheme.up();
  tc.up();

  ac.up();

  // TaxTotal (simple, for allowance section)
  const tt = doc.ele(NS.cac, 'cac:TaxTotal');
  tt.ele(NS.cbc, 'cbc:TaxAmount').att('currencyID', invoice.currency).txt(totalTax.toFixed(2)).up();
  tt.up();
}

function buildTaxTotalWithSubtotal(doc: any, totalTax: number, subtotal: number, cur: string) {
  const tt = doc.ele(NS.cac, 'cac:TaxTotal');
  tt.ele(NS.cbc, 'cbc:TaxAmount').att('currencyID', cur).txt(totalTax.toFixed(2)).up();

  const sub = tt.ele(NS.cac, 'cac:TaxSubtotal');
  sub.ele(NS.cbc, 'cbc:TaxableAmount').att('currencyID', cur).txt(subtotal.toFixed(2)).up();
  sub.ele(NS.cbc, 'cbc:TaxAmount').att('currencyID', cur).txt(totalTax.toFixed(2)).up();

  const tc = sub.ele(NS.cac, 'cac:TaxCategory');
  tc.ele(NS.cbc, 'cbc:ID').txt('S').up();
  tc.ele(NS.cbc, 'cbc:Percent').txt('15.00').up();
  const scheme = tc.ele(NS.cac, 'cac:TaxScheme');
  scheme.ele(NS.cbc, 'cbc:ID').txt('VAT').up();
  scheme.up();
  tc.up();

  sub.up();
  tt.up();
}

function buildLegalMonetaryTotal(
  doc: any,
  totals: ReturnType<typeof calculateTotals>,
  discount: number,
  cur: string,
) {
  const f = (n: number) => n.toFixed(2);
  const lmt = doc.ele(NS.cac, 'cac:LegalMonetaryTotal');
  lmt.ele(NS.cbc, 'cbc:LineExtensionAmount').att('currencyID', cur).txt(f(totals.subtotal)).up();
  lmt.ele(NS.cbc, 'cbc:TaxExclusiveAmount').att('currencyID', cur).txt(f(totals.subtotal)).up();
  lmt.ele(NS.cbc, 'cbc:TaxInclusiveAmount').att('currencyID', cur).txt(f(totals.totalWithTax)).up();
  lmt.ele(NS.cbc, 'cbc:AllowanceTotalAmount').att('currencyID', cur).txt(f(discount)).up();
  lmt.ele(NS.cbc, 'cbc:PayableAmount').att('currencyID', cur).txt(f(totals.payableAmount)).up();
  lmt.up();
}

function buildInvoiceLines(doc: any, invoice: Invoice) {
  const cur = invoice.currency;
  const f = (n: number) => n.toFixed(2);

  invoice.items.forEach((item, i) => {
    const { lineExtension, tax } = calculateItemAmounts(item, invoice.isTaxIncludedInPrice);

    const il = doc.ele(NS.cac, 'cac:InvoiceLine');
    il.ele(NS.cbc, 'cbc:ID').txt(String(i + 1)).up();
    il.ele(NS.cbc, 'cbc:InvoicedQuantity').att('unitCode', item.unitOfMeasure).txt(f(item.quantity)).up();
    il.ele(NS.cbc, 'cbc:LineExtensionAmount').att('currencyID', cur).txt(f(lineExtension)).up();

    // TaxTotal per line
    const tt = il.ele(NS.cac, 'cac:TaxTotal');
    tt.ele(NS.cbc, 'cbc:TaxAmount').att('currencyID', cur).txt(f(tax)).up();
    tt.ele(NS.cbc, 'cbc:RoundingAmount').att('currencyID', cur).txt(f(lineExtension + tax)).up();
    tt.up();

    // Item
    const itm = il.ele(NS.cac, 'cac:Item');
    itm.ele(NS.cbc, 'cbc:Name').txt(item.name).up();

    const ctc = itm.ele(NS.cac, 'cac:ClassifiedTaxCategory');
    ctc.ele(NS.cbc, 'cbc:ID').txt('S').up();
    ctc.ele(NS.cbc, 'cbc:Percent').txt('15.00').up();
    const scheme = ctc.ele(NS.cac, 'cac:TaxScheme');
    scheme.ele(NS.cbc, 'cbc:ID').txt('VAT').up();
    scheme.up();
    ctc.up();

    itm.up();

    // Price (tax-exclusive unit price)
    const unitPrice = invoice.isTaxIncludedInPrice
      ? lineExtension / item.quantity
      : item.price;
    const price = il.ele(NS.cac, 'cac:Price');
    price.ele(NS.cbc, 'cbc:PriceAmount').att('currencyID', cur).txt(f(unitPrice)).up();
    price.up();

    il.up();
  });
}
