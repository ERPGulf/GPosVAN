import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { INVOICE_SUBTYPE, NS } from './constants';
import { calculateItemAmounts, calculateTotals } from './totals';
import type { SalesReturnInvoice } from './types';
import {
    injectQRData,
    injectUBLExtensions,
} from './XMLHelper';

export function buildSalesReturnXML(invoice: SalesReturnInvoice): Document {
  const doc = new DOMParser().parseFromString('<Invoice/>', 'text/xml');
  const root = doc.documentElement;

  root.setAttribute("xmlns", NS.ubl);
  root.setAttribute("xmlns:cac", NS.cac);
  root.setAttribute("xmlns:cbc", NS.cbc);
  root.setAttribute("xmlns:ext", NS.ext);

  const invoiceSubtype = invoice.invoiceSubtype ?? INVOICE_SUBTYPE;
  const cur = invoice.currency;

  appendCbc(doc, root, "ProfileID", "reporting:1.0");
  appendCbc(doc, root, "ID", `ACC-SINV-${new Date().getFullYear()}-${invoice.invoiceNumber}`);
  appendCbc(doc, root, "UUID", invoice.uuid);
  appendCbc(doc, root, "IssueDate", invoice.issueDate);
  appendCbc(doc, root, "IssueTime", invoice.issueTime);

  const typeCode = doc.createElement("cbc:InvoiceTypeCode");
  typeCode.setAttribute("name", invoiceSubtype);
  typeCode.textContent = "381";
  root.appendChild(typeCode);

  appendCbc(doc, root, "DocumentCurrencyCode", cur);
  appendCbc(doc, root, "TaxCurrencyCode", cur);

  // ICV Reference
  const icv = doc.createElement("cac:AdditionalDocumentReference");
  appendCbc(doc, icv, "ID", "ICV");
  const icvNum = invoice.invoiceNumber.replace(/[^0-9]/g, '');
  appendCbc(doc, icv, "UUID", icvNum);
  root.appendChild(icv);

  // PIH Reference
  const ref = doc.createElement("cac:AdditionalDocumentReference");
  appendCbc(doc, ref, "ID", "PIH");
  const attach = doc.createElement("cac:Attachment");
  const bin = doc.createElement("cbc:EmbeddedDocumentBinaryObject");
  bin.setAttribute("mimeCode", "text/plain");
  bin.textContent = invoice.previousInvoiceHash;
  attach.appendChild(bin);
  ref.appendChild(attach);
  root.appendChild(ref);

  // Billing Reference (original invoice being returned)
  const billingRef = doc.createElement("cac:BillingReference");
  const invDocRef = doc.createElement("cac:InvoiceDocumentReference");
  appendCbc(doc, invDocRef, "ID", invoice.billingReferenceId);
  billingRef.appendChild(invDocRef);
  root.appendChild(billingRef);

  addAccountingSupplierParty(doc, root, invoice.supplier);
  addAccountingCustomerParty(doc, root, invoice.customer);
  
  const delivery = doc.createElement("cac:Delivery");
  appendCbc(doc, delivery, "ActualDeliveryDate", invoice.issueDate.split('T')[0]);
  root.appendChild(delivery);

  const payment = doc.createElement("cac:PaymentMeans");
  appendCbc(doc, payment, "PaymentMeansCode", "30");
  root.appendChild(payment);

  if (invoice.discount && invoice.discount > 0) {
      addAllowanceCharge(doc, root, invoice.discount, cur);
  }

  const totals = calculateTotals(invoice.items, invoice.isTaxIncludedInPrice, invoice.discount);
  
  const tt1 = doc.createElement("cac:TaxTotal");
  appendCbcAmount(doc, tt1, "TaxAmount", totals.totalTax, "currencyID", cur);
  root.appendChild(tt1);

  addTaxTotal(doc, root, totals.totalTax, totals.taxableAmount, cur);
  
  const lmt = doc.createElement("cac:LegalMonetaryTotal");
  appendCbcAmount(doc, lmt, "LineExtensionAmount", totals.subtotal, "currencyID", cur);
  appendCbcAmount(doc, lmt, "TaxExclusiveAmount", totals.taxableAmount, "currencyID", cur);
  appendCbcAmount(doc, lmt, "TaxInclusiveAmount", totals.totalWithTax, "currencyID", cur);
  appendCbcAmount(doc, lmt, "AllowanceTotalAmount", invoice.discount ?? 0, "currencyID", cur);
  appendCbcAmount(doc, lmt, "PayableAmount", totals.payableAmount, "currencyID", cur);
  root.appendChild(lmt);

  invoice.items.forEach((item, index) => {
    const { lineExtension, tax } = calculateItemAmounts(item, invoice.isTaxIncludedInPrice);
    const unitPrice = invoice.isTaxIncludedInPrice ? lineExtension / item.quantity : item.price;

    const line = doc.createElement("cac:InvoiceLine");
    appendCbc(doc, line, "ID", (index + 1).toString());
    appendCbcAmount(doc, line, "InvoicedQuantity", item.quantity, "unitCode", item.unitOfMeasure);
    appendCbcAmount(doc, line, "LineExtensionAmount", lineExtension, "currencyID", cur);

    const totalTaxLine = doc.createElement("cac:TaxTotal");
    const taxAmountTag = doc.createElement("cbc:TaxAmount");
    taxAmountTag.setAttribute("currencyID", cur);
    taxAmountTag.textContent = tax.toFixed(2);

    const roundingAmount = doc.createElement("cbc:RoundingAmount");
    roundingAmount.setAttribute("currencyID", cur);
    roundingAmount.textContent = (lineExtension + tax).toFixed(2);

    totalTaxLine.appendChild(taxAmountTag);
    totalTaxLine.appendChild(roundingAmount);
    line.appendChild(totalTaxLine);

    const itemTag = doc.createElement("cac:Item");
    appendCbc(doc, itemTag, "Name", item.name);
    
    const taxCategory = doc.createElement("cac:ClassifiedTaxCategory");
    appendCbc(doc, taxCategory, "ID", "S");
    appendCbc(doc, taxCategory, "Percent", "15.00");
    const taxScheme = doc.createElement("cac:TaxScheme");
    appendCbc(doc, taxScheme, "ID", "VAT");
    taxCategory.appendChild(taxScheme);
    itemTag.appendChild(taxCategory);
    line.appendChild(itemTag);

    const price = doc.createElement("cac:Price");
    appendCbcAmount(doc, price, "PriceAmount", unitPrice, "currencyID", cur);
    line.appendChild(price);

    root.appendChild(line);
  });

  return doc;
}

export function injectSalesReturnQRData(doc: Document, qrBase64: string): void {
  injectQRData(doc, qrBase64);
}

export function injectSalesReturnUBLExtensions(
  doc: Document,
  invoiceHashBase64: string,
  signedPropsHash: string,
  signatureValueBase64: string,
  certificateBody: string,
  signingTime: string,
  certificateDigest: string,
  issuerName: string,
  serialNumber: string,
): void {
  injectUBLExtensions(
      doc,
      invoiceHashBase64,
      signedPropsHash,
      signatureValueBase64,
      certificateBody,
      signingTime,
      certificateDigest,
      issuerName,
      serialNumber
  );
}

// Internal Builders duplicate
function appendCbc(doc: Document, parent: Element, tag: string, val: string) {
    const el = doc.createElement(`cbc:${tag}`);
    el.textContent = val;
    parent.appendChild(el);
}

function appendCbcAmount(doc: Document, parent: Element, tag: string, val: number, attr: string, attrVal: string) {
    const el = doc.createElement(`cbc:${tag}`);
    el.setAttribute(attr, attrVal);
    el.textContent = val.toFixed(2);
    parent.appendChild(el);
}

function addAccountingSupplierParty(doc: Document, root: Element, supplier: any) {
    const asp = doc.createElement("cac:AccountingSupplierParty");
    const party = doc.createElement("cac:Party");

    const partyId = doc.createElement("cac:PartyIdentification");
    const id = doc.createElement("cbc:ID");
    id.setAttribute("schemeID", "CRN");
    id.textContent = supplier.companyRegistrationNo;
    partyId.appendChild(id);
    party.appendChild(partyId);

    const addr = doc.createElement("cac:PostalAddress");
    appendCbc(doc, addr, "StreetName", supplier.address.street);
    appendCbc(doc, addr, "BuildingNumber", supplier.address.buildingNumber || "0");
    appendCbc(doc, addr, "PlotIdentification", supplier.address.plotIdentification);
    appendCbc(doc, addr, "CitySubdivisionName", supplier.address.citySubdivision);
    appendCbc(doc, addr, "CityName", supplier.address.city);
    appendCbc(doc, addr, "PostalZone", (supplier.address.postalZone || "00000").substring(0,5));
    appendCbc(doc, addr, "CountrySubentity", supplier.address.countrySubentity);
    
    const country = doc.createElement("cac:Country");
    appendCbc(doc, country, "IdentificationCode", supplier.address.countryCode);
    addr.appendChild(country);
    party.appendChild(addr);

    const pts = doc.createElement("cac:PartyTaxScheme");
    appendCbc(doc, pts, "CompanyID", supplier.vatNumber);
    const ts = doc.createElement("cac:TaxScheme");
    appendCbc(doc, ts, "ID", "VAT");
    pts.appendChild(ts);
    party.appendChild(pts);

    const pName = doc.createElement("cac:PartyLegalEntity");
    appendCbc(doc, pName, "RegistrationName", supplier.registrationName);
    party.appendChild(pName);

    asp.appendChild(party);
    root.appendChild(asp);
}

function addAccountingCustomerParty(doc: Document, root: Element, customer: any) {
    const acp = doc.createElement("cac:AccountingCustomerParty");
    const party = doc.createElement("cac:Party");

    const partyScheme = doc.createElement("cac:PartyTaxScheme");
    const taxScheme = doc.createElement("cac:TaxScheme");
    const taxId = doc.createElement("cbc:ID");
    taxId.textContent = "VAT";
    taxScheme.appendChild(taxId);
    partyScheme.appendChild(taxScheme);
    party.appendChild(partyScheme);

    const pName = doc.createElement("cac:PartyLegalEntity");
    appendCbc(doc, pName, "RegistrationName", customer.registrationName);
    party.appendChild(pName);

    acp.appendChild(party);
    root.appendChild(acp);
}

function addAllowanceCharge(doc: Document, root: Element, discountAmount: number, cur: string) {
    const allowanceCharge = doc.createElement("cac:AllowanceCharge");
    const id = doc.createElement("cbc:ChargeIndicator");
    id.textContent = "false";
    allowanceCharge.appendChild(id);
    const reasonCode = doc.createElement("cbc:AllowanceChargeReasonCode");
    reasonCode.textContent = "95";
    allowanceCharge.appendChild(reasonCode);
    const reason = doc.createElement("cbc:AllowanceChargeReason");
    reason.textContent = "Discount";
    allowanceCharge.appendChild(reason);
    const amount = doc.createElement("cbc:Amount");
    amount.setAttribute("currencyID", cur);
    amount.textContent = discountAmount.toFixed(2);
    allowanceCharge.appendChild(amount);
    const taxCategory = doc.createElement("cac:TaxCategory");
    appendCbc(doc, taxCategory, "ID", "S");
    appendCbc(doc, taxCategory, "Percent", "15.00");
    const taxScheme = doc.createElement("cac:TaxScheme");
    appendCbc(doc, taxScheme, "ID", "VAT");
    taxCategory.appendChild(taxScheme);
    allowanceCharge.appendChild(taxCategory);
    root.appendChild(allowanceCharge);
}

function addTaxTotal(doc: Document, root: Element, taxAmount: number, taxableAmount: number, cur: string) {
    const tt2 = doc.createElement("cac:TaxTotal");
    appendCbcAmount(doc, tt2, "TaxAmount", taxAmount, "currencyID", cur);
    const sub = doc.createElement("cac:TaxSubtotal");
    appendCbcAmount(doc, sub, "TaxableAmount", taxableAmount, "currencyID", cur);
    appendCbcAmount(doc, sub, "TaxAmount", taxAmount, "currencyID", cur);
    const cat = doc.createElement("cac:TaxCategory");
    appendCbc(doc, cat, "ID", "S");
    appendCbc(doc, cat, "Percent", "15.00");
    const ts = doc.createElement("cac:TaxScheme");
    appendCbc(doc, ts, "ID", "VAT");
    cat.appendChild(ts);
    sub.appendChild(cat);
    tt2.appendChild(sub);
    root.appendChild(tt2);
}
