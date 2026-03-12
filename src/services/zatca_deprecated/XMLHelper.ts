import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { C14nCanonicalization } from 'xml-crypto/lib/c14n-canonicalization';

// Types and constants
import { INVOICE_SUBTYPE } from './constants';
import { calculateItemAmounts, calculateTotals } from './totals';
import type { CustomerParty, Invoice, SupplierParty } from './types';

// Namespaces from the NodeJS script
const xmlns = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
const xmlns_cac = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
const xmlns_cbc = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
const xmlns_ext = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
const xmlns_sig = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2';
const xmlns_sac = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2';
const xmlns_sbc = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2';
const xmlns_ds = 'http://www.w3.org/2000/09/xmldsig#';

/**
 * 1. Build the base XML strictly using the DOM to precisely match the Node.js implementation
 */
export function buildInvoiceXML(invoice: Invoice): Document {
  const doc = new DOMParser().parseFromString('<Invoice/>', 'text/xml');
  const root = doc.documentElement;

  root.setAttribute('xmlns', xmlns);
  root.setAttribute('xmlns:cac', xmlns_cac);
  root.setAttribute('xmlns:cbc', xmlns_cbc);
  root.setAttribute('xmlns:ext', xmlns_ext);

  addBaseTags(doc, root, invoice);
  addAdditionalReferenceTags(doc, root, invoice.invoiceNumber, invoice.previousInvoiceHash);
  addAccountingSupplierParty(doc, root, invoice.supplier, invoice.customer);
  addAccountingCustomerParty(doc, root, invoice.customer);
  addDeliveryAndPaymentTags(doc, root, invoice.issueDate);

  if (invoice.discount && invoice.discount > 0) {
    addAllowanceCharge(doc, root, invoice.discount, invoice.currency);
  }

  const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
  addTaxTotal(doc, root, totals.totalTax, totals.taxableAmount, invoice.currency);
  addLegalMonetaryTotal(doc, root, totals, invoice.discount, invoice.currency);
  addItems(doc, root, invoice);

  return doc;
}

export function serializeXML(doc: Document): string {
  return new XMLSerializer().serializeToString(doc);
}

// -------------------------------------------------------------------------------
// 1. Worker Functions translated from Node.js strings to DOM manipulation
// -------------------------------------------------------------------------------

function addBaseTags(doc: Document, root: Element, invoice: Invoice) {
  appendCbc(doc, root, 'ProfileID', 'reporting:1.0');
  appendCbc(doc, root, 'ID', `ACC-SINV-${new Date().getFullYear()}-${invoice.invoiceNumber}`);
  appendCbc(doc, root, 'UUID', invoice.uuid);
  appendCbc(doc, root, 'IssueDate', invoice.issueDate);
  appendCbc(doc, root, 'IssueTime', invoice.issueTime);

  const typeCode = doc.createElement('cbc:InvoiceTypeCode');
  typeCode.setAttribute('name', invoice.invoiceSubtype ?? INVOICE_SUBTYPE);
  typeCode.textContent = '388';
  root.appendChild(typeCode);

  appendCbc(doc, root, 'DocumentCurrencyCode', invoice.currency);
  appendCbc(doc, root, 'TaxCurrencyCode', invoice.currency);
}

function addAdditionalReferenceTags(doc: Document, root: Element, invNo: string, pih: string) {
  // PIH Reference
  const ref = doc.createElement('cac:AdditionalDocumentReference');
  appendCbc(doc, ref, 'ID', 'PIH');
  const attach = doc.createElement('cac:Attachment');
  const bin = doc.createElement('cbc:EmbeddedDocumentBinaryObject');
  bin.setAttribute('mimeCode', 'text/plain');
  bin.textContent = pih;
  attach.appendChild(bin);
  ref.appendChild(attach);
  root.appendChild(ref);

  // ICV Reference
  const icv = doc.createElement('cac:AdditionalDocumentReference');
  appendCbc(doc, icv, 'ID', 'ICV');
  const icvNum = invNo.replace(/[^0-9]/g, '');
  appendCbc(doc, icv, 'UUID', icvNum);
  root.appendChild(icv);
}

function addAccountingSupplierParty(
  doc: Document,
  root: Element,
  supplier: SupplierParty,
  customer: CustomerParty,
) {
  const asp = doc.createElement('cac:AccountingSupplierParty');
  const party = doc.createElement('cac:Party');

  const partyId = doc.createElement('cac:PartyIdentification');
  const id = doc.createElement('cbc:ID');
  id.setAttribute('schemeID', 'CRN');
  id.textContent = supplier.companyRegistrationNo;
  partyId.appendChild(id);
  party.appendChild(partyId);

  const addr = doc.createElement('cac:PostalAddress');
  appendCbc(doc, addr, 'StreetName', supplier.address.street);
  appendCbc(doc, addr, 'BuildingNumber', supplier.address.buildingNumber || '0');
  appendCbc(doc, addr, 'PlotIdentification', supplier.address.plotIdentification);
  appendCbc(doc, addr, 'CitySubdivisionName', supplier.address.citySubdivision);
  appendCbc(doc, addr, 'CityName', supplier.address.city);
  appendCbc(doc, addr, 'PostalZone', (supplier.address.postalZone || '00000').substring(0, 5));
  appendCbc(doc, addr, 'CountrySubentity', supplier.address.countrySubentity);

  const country = doc.createElement('cac:Country');
  appendCbc(doc, country, 'IdentificationCode', supplier.address.countryCode);
  addr.appendChild(country);
  party.appendChild(addr);

  const pts = doc.createElement('cac:PartyTaxScheme');
  appendCbc(doc, pts, 'CompanyID', supplier.vatNumber);
  const ts = doc.createElement('cac:TaxScheme');
  appendCbc(doc, ts, 'ID', 'VAT');
  pts.appendChild(ts);
  party.appendChild(pts);

  const pName = doc.createElement('cac:PartyLegalEntity');
  appendCbc(doc, pName, 'RegistrationName', supplier.registrationName);
  party.appendChild(pName);

  asp.appendChild(party);
  root.appendChild(asp);
}

function addAccountingCustomerParty(doc: Document, root: Element, customer: CustomerParty) {
  const acp = doc.createElement('cac:AccountingCustomerParty');
  const party = doc.createElement('cac:Party');

  const partyScheme = doc.createElement('cac:PartyTaxScheme');
  const taxScheme = doc.createElement('cac:TaxScheme');
  const taxId = doc.createElement('cbc:ID');
  taxId.textContent = 'VAT';
  taxScheme.appendChild(taxId);
  partyScheme.appendChild(taxScheme);
  party.appendChild(partyScheme);

  const pName = doc.createElement('cac:PartyLegalEntity');
  appendCbc(doc, pName, 'RegistrationName', customer.registrationName);
  party.appendChild(pName);

  acp.appendChild(party);
  root.appendChild(acp);
}

function addDeliveryAndPaymentTags(doc: Document, root: Element, date: string) {
  const delivery = doc.createElement('cac:Delivery');
  appendCbc(doc, delivery, 'ActualDeliveryDate', date.split('T')[0]);
  root.appendChild(delivery);

  const payment = doc.createElement('cac:PaymentMeans');
  appendCbc(doc, payment, 'PaymentMeansCode', '30'); // 30 = Credit
  root.appendChild(payment);
}

function addAllowanceCharge(doc: Document, root: Element, discountAmount: number, cur: string) {
  const allowanceCharge = doc.createElement('cac:AllowanceCharge');

  const id = doc.createElement('cbc:ChargeIndicator');
  id.textContent = 'false';
  allowanceCharge.appendChild(id);

  const reasonCode = doc.createElement('cbc:AllowanceChargeReasonCode');
  reasonCode.textContent = '95';
  allowanceCharge.appendChild(reasonCode);

  const reason = doc.createElement('cbc:AllowanceChargeReason');
  reason.textContent = 'Discount';
  allowanceCharge.appendChild(reason);

  const amount = doc.createElement('cbc:Amount');
  amount.setAttribute('currencyID', cur);
  amount.textContent = discountAmount.toFixed(2);
  allowanceCharge.appendChild(amount);

  const taxCategory = doc.createElement('cac:TaxCategory');
  appendCbc(doc, taxCategory, 'ID', 'S');
  appendCbc(doc, taxCategory, 'Percent', '15.00');

  const taxScheme = doc.createElement('cac:TaxScheme');
  appendCbc(doc, taxScheme, 'ID', 'VAT');
  taxCategory.appendChild(taxScheme);

  allowanceCharge.appendChild(taxCategory);
  root.appendChild(allowanceCharge);
}

function addTaxTotal(
  doc: Document,
  root: Element,
  taxAmount: number,
  taxableAmount: number,
  cur: string,
) {
  const tt1 = doc.createElement('cac:TaxTotal');
  appendCbcAmount(doc, tt1, 'TaxAmount', taxAmount, 'currencyID', cur);
  root.appendChild(tt1);

  const tt2 = doc.createElement('cac:TaxTotal');
  appendCbcAmount(doc, tt2, 'TaxAmount', taxAmount, 'currencyID', cur);

  const sub = doc.createElement('cac:TaxSubtotal');
  appendCbcAmount(doc, sub, 'TaxableAmount', taxableAmount, 'currencyID', cur);
  appendCbcAmount(doc, sub, 'TaxAmount', taxAmount, 'currencyID', cur);

  const cat = doc.createElement('cac:TaxCategory');
  appendCbc(doc, cat, 'ID', 'S');
  appendCbc(doc, cat, 'Percent', '15.00');
  const ts = doc.createElement('cac:TaxScheme');
  appendCbc(doc, ts, 'ID', 'VAT');
  cat.appendChild(ts);
  sub.appendChild(cat);

  tt2.appendChild(sub);
  root.appendChild(tt2);
}

function addLegalMonetaryTotal(
  doc: Document,
  root: Element,
  totals: ReturnType<typeof calculateTotals>,
  discount: number,
  cur: string,
) {
  const lmt = doc.createElement('cac:LegalMonetaryTotal');
  appendCbcAmount(doc, lmt, 'LineExtensionAmount', totals.subtotal, 'currencyID', cur);
  appendCbcAmount(doc, lmt, 'TaxExclusiveAmount', totals.taxableAmount, 'currencyID', cur);
  appendCbcAmount(doc, lmt, 'TaxInclusiveAmount', totals.totalWithTax, 'currencyID', cur);
  appendCbcAmount(doc, lmt, 'AllowanceTotalAmount', discount, 'currencyID', cur);
  appendCbcAmount(doc, lmt, 'PayableAmount', totals.payableAmount, 'currencyID', cur);
  root.appendChild(lmt);
}

function addItems(doc: Document, root: Element, invoice: Invoice) {
  const cur = invoice.currency;
  invoice.items.forEach((item, index) => {
    const { lineExtension, tax } = calculateItemAmounts(item, invoice.isTaxIncludedInPrice);
    const unitPrice = invoice.isTaxIncludedInPrice ? lineExtension / item.quantity : item.price;

    const line = doc.createElement('cac:InvoiceLine');
    appendCbc(doc, line, 'ID', (index + 1).toString());
    appendCbcAmount(doc, line, 'InvoicedQuantity', item.quantity, 'unitCode', item.unitOfMeasure);
    appendCbcAmount(doc, line, 'LineExtensionAmount', lineExtension, 'currencyID', cur);

    const totalTaxLine = doc.createElement('cac:TaxTotal');
    const taxAmountTag = doc.createElement('cbc:TaxAmount');
    taxAmountTag.setAttribute('currencyID', cur);
    taxAmountTag.textContent = tax.toFixed(2);

    const roundingAmount = doc.createElement('cbc:RoundingAmount');
    roundingAmount.setAttribute('currencyID', cur);
    roundingAmount.textContent = (lineExtension + tax).toFixed(2);

    totalTaxLine.appendChild(taxAmountTag);
    totalTaxLine.appendChild(roundingAmount);
    line.appendChild(totalTaxLine);

    const itemTag = doc.createElement('cac:Item');
    appendCbc(doc, itemTag, 'Name', item.name);

    const taxCategory = doc.createElement('cac:ClassifiedTaxCategory');
    appendCbc(doc, taxCategory, 'ID', 'S');
    appendCbc(doc, taxCategory, 'Percent', '15.00');
    const taxScheme = doc.createElement('cac:TaxScheme');
    appendCbc(doc, taxScheme, 'ID', 'VAT');
    taxCategory.appendChild(taxScheme);
    itemTag.appendChild(taxCategory);
    line.appendChild(itemTag);

    const price = doc.createElement('cac:Price');
    appendCbcAmount(doc, price, 'PriceAmount', unitPrice, 'currencyID', cur);
    line.appendChild(price);

    root.appendChild(line);
  });
}

/**
 * 2. Adds the QR Code reference and the Signature metadata tags.
 */
export function injectQRData(doc: Document, qrCodeBase64: string) {
  const root = doc.documentElement;

  // Remove any existing PLACEHOLDER_QR if present
  const existingRefs = root.getElementsByTagName('cac:AdditionalDocumentReference');
  for (let i = 0; i < existingRefs.length; i++) {
    const idNode = existingRefs[i].getElementsByTagName('cbc:ID')[0];
    if (idNode && idNode.textContent === 'QR') {
      // Already have a QR tag, just update the payload and return
      root.removeChild(existingRefs[i]);
      // We'll regenerate it below.
      break;
    }
  }

  // Also remove the existing Signature Placeholders if they exist
  const existingSigs = root.getElementsByTagName('cac:Signature');
  for (let i = 0; i < existingSigs.length; i++) {
    root.removeChild(existingSigs[i]);
  }

  const documentQR = doc.createElement('cac:AdditionalDocumentReference');
  const qrID = doc.createElement('cbc:ID');
  qrID.textContent = 'QR';
  documentQR.appendChild(qrID);

  const qrAttachment = doc.createElement('cac:Attachment');
  const qrEmbedded = doc.createElement('cbc:EmbeddedDocumentBinaryObject');
  qrEmbedded.setAttribute('mimeCode', 'text/plain');
  qrEmbedded.textContent = qrCodeBase64;
  qrAttachment.appendChild(qrEmbedded);
  documentQR.appendChild(qrAttachment);

  const signature = doc.createElement('cac:Signature');
  const signatureId = doc.createElement('cbc:ID');
  signatureId.textContent = 'urn:oasis:names:specification:ubl:signature:Invoice';
  signature.appendChild(signatureId);

  const signatureMethod = doc.createElement('cbc:SignatureMethod');
  signatureMethod.textContent = 'urn:oasis:names:specification:ubl:dsig:enveloped:xades';
  signature.appendChild(signatureMethod);

  const supplierParty = root.getElementsByTagName('cac:AccountingSupplierParty')[0];
  if (supplierParty && supplierParty.parentNode) {
    supplierParty.parentNode.insertBefore(documentQR, supplierParty);
    supplierParty.parentNode.insertBefore(signature, supplierParty);
  } else {
    // Fallback
    root.appendChild(documentQR);
    root.appendChild(signature);
  }
}

/**
 * 3. Injects the UBL Extensions block (Digital Signature) into the XML.
 */
export function injectUBLExtensions(
  doc: Document,
  invoiceHashBase64: string,
  signInfoHash: string,
  signatureValue: string,
  certValue: string,
  signingTime: string,
  certDigest: string,
  issuerName: string,
  serialNumber: string,
) {
  const root = doc.documentElement;

  const extensions = doc.createElement('ext:UBLExtensions');
  const extension = doc.createElement('ext:UBLExtension');
  extensions.appendChild(extension);

  const extensionURI = doc.createElement('ext:ExtensionURI');
  extensionURI.textContent = 'urn:oasis:names:specification:ubl:dsig:enveloped:xades';
  extension.appendChild(extensionURI);

  const extensionContent = doc.createElement('ext:ExtensionContent');
  extension.appendChild(extensionContent);

  // Provide the required attributes for UBLDocumentSignatures EXACTLY matching Node JS script
  const ublDocSigs = doc.createElementNS(xmlns_sbc, 'sbc:UBLDocumentSignatures');
  ublDocSigs.setAttribute('xmlns:sbc', xmlns_sbc);
  ublDocSigs.setAttribute('xmlns:sig', xmlns_sig);
  ublDocSigs.setAttribute('xmlns:sac', xmlns_sac);

  extensionContent.appendChild(ublDocSigs);

  const sigInfo = doc.createElement('sac:SignatureInformation');
  ublDocSigs.appendChild(sigInfo);

  const sigID = doc.createElement('cbc:ID');
  sigID.textContent = 'urn:oasis:names:specification:ubl:signature:1';
  sigInfo.appendChild(sigID);

  const refSigID = doc.createElement('sbc:ReferencedSignatureID');
  refSigID.textContent = 'urn:oasis:names:specification:ubl:signature:Invoice';
  sigInfo.appendChild(refSigID);

  // ds:Signature Element
  const dsSignature = doc.createElementNS(xmlns_ds, 'ds:Signature');
  // Explicitly set namespace
  dsSignature.setAttribute('xmlns:ds', xmlns_ds);
  dsSignature.setAttribute('Id', 'signature');
  sigInfo.appendChild(dsSignature);

  // ds:SignedInfo
  const signedInfo = doc.createElement('ds:SignedInfo');
  dsSignature.appendChild(signedInfo);

  const canonMethod = doc.createElement('ds:CanonicalizationMethod');
  canonMethod.setAttribute('Algorithm', 'http://www.w3.org/2006/12/xml-c14n11');
  signedInfo.appendChild(canonMethod);

  const sigMethod = doc.createElement('ds:SignatureMethod');
  sigMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256');
  signedInfo.appendChild(sigMethod);

  // ds:Reference 1
  const reference = doc.createElement('ds:Reference');
  reference.setAttribute('Id', 'invoiceSignedData');
  reference.setAttribute('URI', '');
  signedInfo.appendChild(reference);

  const transforms = doc.createElement('ds:Transforms');
  reference.appendChild(transforms);
  addTransform(
    doc,
    transforms,
    'http://www.w3.org/TR/1999/REC-xpath-19991116',
    'not(//ancestor-or-self::ext:UBLExtensions)',
  );
  addTransform(
    doc,
    transforms,
    'http://www.w3.org/TR/1999/REC-xpath-19991116',
    'not(//ancestor-or-self::cac:Signature)',
  );
  addTransform(
    doc,
    transforms,
    'http://www.w3.org/TR/1999/REC-xpath-19991116',
    "not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])",
  );
  addTransform(doc, transforms, 'http://www.w3.org/2006/12/xml-c14n11', null);

  const digestMethod = doc.createElement('ds:DigestMethod');
  digestMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');
  reference.appendChild(digestMethod);

  const digestValue = doc.createElement('ds:DigestValue');
  digestValue.textContent = invoiceHashBase64;
  reference.appendChild(digestValue);

  // ds:Reference 2
  const reference2 = doc.createElement('ds:Reference');
  reference2.setAttribute('URI', '#xadesSignedProperties');
  reference2.setAttribute('Type', 'http://www.w3.org/2000/09/xmldsig#SignatureProperties');
  signedInfo.appendChild(reference2);

  const digestMethod2 = doc.createElement('ds:DigestMethod');
  digestMethod2.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');
  reference2.appendChild(digestMethod2);

  const digestValue2 = doc.createElement('ds:DigestValue');
  digestValue2.textContent = signInfoHash;
  reference2.appendChild(digestValue2);

  // Signature Value
  const sigVal = doc.createElement('ds:SignatureValue');
  sigVal.textContent = signatureValue;
  dsSignature.appendChild(sigVal);

  // KeyInfo & Cert
  const keyInfo = doc.createElement('ds:KeyInfo');
  const x509Data = doc.createElement('ds:X509Data');
  const x509Cert = doc.createElement('ds:X509Certificate');
  x509Cert.textContent = certValue;
  x509Data.appendChild(x509Cert);
  keyInfo.appendChild(x509Data);
  dsSignature.appendChild(keyInfo);

  // ds:Object
  const dsObject = doc.createElement('ds:Object');

  // Reconstruct the exact Signature Properties string to avoid formatting mismatches
  const signatureText = `<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">
<xades:SignedProperties Id="xadesSignedProperties">
<xades:SignedSignatureProperties>
<xades:SigningTime>${signingTime}</xades:SigningTime>
<xades:SigningCertificate>
<xades:Cert>
<xades:CertDigest>
<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
<ds:DigestValue>${certDigest}</ds:DigestValue>
</xades:CertDigest>
<xades:IssuerSerial>
<ds:X509IssuerName>${issuerName}</ds:X509IssuerName>
<ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>
</xades:IssuerSerial>
</xades:Cert>
</xades:SigningCertificate>
</xades:SignedSignatureProperties>
</xades:SignedProperties>
</xades:QualifyingProperties>`;

  // Adding raw XML content is usually tricky with xmldom. Instead, we can parse it as a new document and attach its docElement
  const tempParsed = new DOMParser().parseFromString(signatureText, 'text/xml');
  dsObject.appendChild(tempParsed.documentElement);

  dsSignature.appendChild(dsObject);

  if (root.firstChild) {
    root.insertBefore(extensions, root.firstChild);
  } else {
    root.appendChild(extensions);
  }
}

// -------------------------------------------------------------------------------
// Helper Utilities for DOM
// -------------------------------------------------------------------------------

function appendCbc(doc: Document, parent: Element, tag: string, val: string) {
  const el = doc.createElement(`cbc:${tag}`);
  el.textContent = val;
  parent.appendChild(el);
}

function appendCbcAmount(
  doc: Document,
  parent: Element,
  tag: string,
  val: number,
  attr: string,
  attrVal: string,
) {
  const el = doc.createElement(`cbc:${tag}`);
  el.setAttribute(attr, attrVal);
  el.textContent = val.toFixed(2);
  parent.appendChild(el);
}

function addTransform(
  doc: Document,
  parent: Element,
  algorithm: string,
  xpathValue: string | null,
) {
  const transform = doc.createElementNS(xmlns_ds, 'ds:Transform');
  transform.setAttribute('Algorithm', algorithm);

  // According to Node JS Reference, if no xpathValue, then it's just <ds:Transform Algorithm="..."/>
  if (xpathValue) {
    const xpath = doc.createElementNS(xmlns_ds, 'ds:XPath');
    xpath.textContent = xpathValue;
    transform.appendChild(xpath);
  }

  parent.appendChild(transform);
}

/**
 * 4. Helper to canonicalize a document element explicitly replicating canon.process
 */
export function canonicalizeDOM(doc: Document | Element): string {
  const canon = new C14nCanonicalization();
  let result = '';
  // if Document, grab element
  if ('documentElement' in doc) {
    result = canon.process(doc.documentElement, {});
  } else {
    result = canon.process(doc, {});
  }
  // Perform exact replacement applied in node js script
  return result.split('&#xD;').join('');
}
