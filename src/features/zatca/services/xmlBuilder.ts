/**
 * ZATCA UBL 2.1 XML Invoice Builder.
 *
 * Builds the invoice XML as a string using template literals.
 * Ports the C# XMLHelper class methods.
 */
import type { CartItem } from '@/src/features/cart/types';
import type { InvoiceCustomer, InvoiceSubType, InvoiceTypeCode, ZatcaConfig } from '../types';

// --- Tax Utility ---

interface TaxCalc {
  productPrice: number;
  taxAmount: number;
}

type TaxCategoryId = 'S' | 'Z';

interface InvoiceLineAmounts {
  itemName: string;
  lineExtensionAmount: number;
  priceAmount: number;
  quantity: number;
  roundingAmount: number;
  taxAmount: number;
  taxCategoryId: TaxCategoryId;
  taxPercent: number;
  unitCode: string;
}

interface InvoiceTaxSubtotal {
  discountAmount: number;
  taxAmount: number;
  taxCategoryId: TaxCategoryId;
  taxPercent: number;
  taxableAmount: number;
}

export interface InvoiceTaxBreakdown {
  allowanceAmount: number;
  lines: InvoiceLineAmounts[];
  payableAmount: number;
  subtotals: InvoiceTaxSubtotal[];
  taxExclusiveAmount: number;
  taxInclusiveAmount: number;
  totalExclusiveAmount: number;
  totalTaxAmount: number;
}

function calculateTax(amountIncludingTax: number, taxPercent: number): TaxCalc {
  if (taxPercent <= 0) {
    return { productPrice: amountIncludingTax, taxAmount: 0 };
  }
  const taxAmount = amountIncludingTax - amountIncludingTax / (1 + taxPercent / 100);
  const productPrice = amountIncludingTax - taxAmount;
  return { productPrice, taxAmount };
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalizeTaxPercent(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 15;
  return Math.max(0, round2(value));
}

function getTaxCategoryId(taxPercent: number): TaxCategoryId {
  return taxPercent > 0 ? 'S' : 'Z';
}

function buildInvoiceLineAmounts(item: CartItem, isTaxIncluded: boolean): InvoiceLineAmounts {
  const taxPercent = normalizeTaxPercent(item.product.taxPercentage);
  const itemPrice = item.product.uomPrice ?? item.product.price ?? 0;
  const quantity = item.quantity;
  const unitCode = item.product.uom || 'PCE';
  const itemName = item.product.name || 'Item';

  let taxAmount: number;
  let lineExtensionAmount: number;
  let priceAmount: number;
  let roundingAmount: number;

  if (isTaxIncluded) {
    const grossLine = round2(quantity * itemPrice);
    const taxCalc = calculateTax(grossLine, taxPercent);
    taxAmount = round2(taxCalc.taxAmount);
    lineExtensionAmount = round2(grossLine - taxAmount);
    priceAmount = round2(calculateTax(itemPrice, taxPercent).productPrice);
    roundingAmount = grossLine;
  } else {
    lineExtensionAmount = round2(quantity * itemPrice);
    taxAmount = round2((lineExtensionAmount * taxPercent) / 100);
    priceAmount = round2(itemPrice);
    roundingAmount = round2(lineExtensionAmount + taxAmount);
  }

  return {
    itemName,
    lineExtensionAmount,
    priceAmount,
    quantity,
    roundingAmount,
    taxAmount,
    taxCategoryId: getTaxCategoryId(taxPercent),
    taxPercent,
    unitCode,
  };
}

export function calculateInvoiceTaxBreakdown(
  cartItems: CartItem[],
  isTaxIncluded: boolean,
  discount: number,
): InvoiceTaxBreakdown {
  const lines = cartItems.map((item) => buildInvoiceLineAmounts(item, isTaxIncluded));
  const totalExclusiveAmount = round2(
    lines.reduce((sum, line) => sum + line.lineExtensionAmount, 0),
  );
  const requestedAllowance = Math.max(0, round2(discount));
  const allowanceAmount = Math.min(requestedAllowance, totalExclusiveAmount);

  const grouped = new Map<string, InvoiceTaxSubtotal>();
  for (const line of lines) {
    const key = `${line.taxCategoryId}:${line.taxPercent.toFixed(2)}`;
    const current = grouped.get(key);

    if (current) {
      current.taxableAmount = round2(current.taxableAmount + line.lineExtensionAmount);
      current.taxAmount = round2(current.taxAmount + line.taxAmount);
      continue;
    }

    grouped.set(key, {
      discountAmount: 0,
      taxAmount: line.taxAmount,
      taxCategoryId: line.taxCategoryId,
      taxPercent: line.taxPercent,
      taxableAmount: line.lineExtensionAmount,
    });
  }

  const subtotals = Array.from(grouped.values()).sort(
    (left, right) => right.taxPercent - left.taxPercent,
  );

  if (allowanceAmount > 0 && totalExclusiveAmount > 0 && subtotals.length > 0) {
    let allocatedAllowance = 0;

    for (let index = 0; index < subtotals.length; index++) {
      const subtotal = subtotals[index];
      const isLast = index === subtotals.length - 1;
      const proportionalAllowance = isLast
        ? round2(allowanceAmount - allocatedAllowance)
        : round2((allowanceAmount * subtotal.taxableAmount) / totalExclusiveAmount);
      const appliedAllowance = Math.min(proportionalAllowance, subtotal.taxableAmount);

      subtotal.discountAmount = appliedAllowance;
      subtotal.taxableAmount = round2(subtotal.taxableAmount - appliedAllowance);
      subtotal.taxAmount = round2((subtotal.taxableAmount * subtotal.taxPercent) / 100);
      allocatedAllowance = round2(allocatedAllowance + appliedAllowance);
    }
  }

  const totalTaxAmount = round2(subtotals.reduce((sum, subtotal) => sum + subtotal.taxAmount, 0));
  const taxExclusiveAmount = round2(totalExclusiveAmount - allowanceAmount);
  const taxInclusiveAmount = round2(taxExclusiveAmount + totalTaxAmount);

  return {
    allowanceAmount,
    lines,
    payableAmount: taxInclusiveAmount,
    subtotals,
    taxExclusiveAmount,
    taxInclusiveAmount,
    totalExclusiveAmount,
    totalTaxAmount,
  };
}

function sanitizeText(value: string | null | undefined, fallback: string, maxLength = 127): string {
  const text = (value ?? '').trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

function isValidSaudiVat(value: string | null | undefined): boolean {
  const vat = digitsOnly(value);
  return /^3\d{13}3$/.test(vat);
}

function isLikelyCrn(value: string | null | undefined): boolean {
  const crn = digitsOnly(value);
  return /^\d{10}$/.test(crn);
}

function normalizeSaudiPostalCode(value: string | null | undefined): string {
  const code = digitsOnly(value);
  return code.length >= 5 ? code.slice(0, 5) : '00000';
}

function normalizeBuildingNumber(value: string | null | undefined): string {
  const building = sanitizeText(value, '1', 20);
  return building;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(d: Date): string {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatTime(d: Date): string {
  return d.toTimeString().split(' ')[0]; // HH:mm:ss
}

// --- XML Section Builders ---

function buildBaseXmlTags(
  invoiceNumber: string,
  invoiceDate: Date,
  uuid: string,
  invoiceTypeCode: InvoiceTypeCode,
  invoiceSubType: InvoiceSubType,
): string {
  const year = invoiceDate.getFullYear();
  return (
    `\n  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>` +
    `\n  <cbc:ID>ACC-SINV-${year}-${invoiceNumber}</cbc:ID>` +
    `\n  <cbc:UUID>${escapeXml(uuid)}</cbc:UUID>` +
    `\n  <cbc:IssueDate>${formatDate(invoiceDate)}</cbc:IssueDate>` +
    `\n  <cbc:IssueTime>${formatTime(invoiceDate)}</cbc:IssueTime>` +
    `\n  <cbc:InvoiceTypeCode name="${invoiceSubType}">${invoiceTypeCode}</cbc:InvoiceTypeCode>` +
    `\n  <cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode>` +
    `\n  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>`
  );
}

function buildAdditionalReferenceTags(invoiceNumber: string, previousInvoiceHash: string): string {
  const numbers = invoiceNumber.replace(/[^0-9]/g, '');
  return (
    `\n  <cac:AdditionalDocumentReference>` +
    `\n    <cbc:ID>ICV</cbc:ID>` +
    `\n    <cbc:UUID>${numbers}</cbc:UUID>` +
    `\n  </cac:AdditionalDocumentReference>` +
    `\n  <cac:AdditionalDocumentReference>` +
    `\n    <cbc:ID>PIH</cbc:ID>` +
    `\n    <cac:Attachment>` +
    `\n      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(previousInvoiceHash)}</cbc:EmbeddedDocumentBinaryObject>` +
    `\n    </cac:Attachment>` +
    `\n  </cac:AdditionalDocumentReference>`
  );
}

function buildQRTag(): string {
  return (
    `\n  <cac:AdditionalDocumentReference>` +
    `\n    <cbc:ID>QR</cbc:ID>` +
    `\n    <cac:Attachment>` +
    `\n      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">PLACEHOLDER_QR</cbc:EmbeddedDocumentBinaryObject>` +
    `\n    </cac:Attachment>` +
    `\n  </cac:AdditionalDocumentReference>` +
    `\n  <cac:Signature>` +
    `\n    <cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID>` +
    `\n    <cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod>` +
    `\n  </cac:Signature>`
  );
}

function buildAccountingSupplierParty(config: ZatcaConfig): string {
  const addr = config.address;
  const supplierId = (config.companyRegistrationNo ?? '').trim();
  const supplierSchemeId = isLikelyCrn(supplierId) ? 'CRN' : 'NAT';
  return (
    `\n  \n  <cac:AccountingSupplierParty>` +
    `\n    <cac:Party>` +
    `\n      <cac:PartyIdentification>` +
    `\n        <cbc:ID schemeID="${supplierSchemeId}">${escapeXml(supplierId)}</cbc:ID>` +
    `\n      </cac:PartyIdentification>` +
    `\n      <cac:PostalAddress>` +
    `\n        <cbc:StreetName>${escapeXml(addr.streetName)}</cbc:StreetName>` +
    `\n        <cbc:BuildingNumber>${escapeXml(addr.buildingNumber || '0')}</cbc:BuildingNumber>` +
    `\n        <cbc:PlotIdentification>${escapeXml(addr.plotIdentification || addr.streetName)}</cbc:PlotIdentification>` +
    `\n        <cbc:CitySubdivisionName>${escapeXml(addr.citySubdivisionName || addr.cityName)}</cbc:CitySubdivisionName>` +
    `\n        <cbc:CityName>${escapeXml(addr.cityName)}</cbc:CityName>` +
    `\n        <cbc:PostalZone>${escapeXml(addr.postalZone || '000000')}</cbc:PostalZone>` +
    `\n        <cbc:CountrySubentity>${escapeXml(addr.countrySubentity || 'Saudi Arabia')}</cbc:CountrySubentity>` +
    `\n        <cac:Country>` +
    `\n          <cbc:IdentificationCode>${escapeXml(addr.countryCode || 'SA')}</cbc:IdentificationCode>` +
    `\n        </cac:Country>` +
    `\n      </cac:PostalAddress>` +
    `\n      <cac:PartyTaxScheme>` +
    `\n        <cbc:CompanyID>${escapeXml(config.taxId)}</cbc:CompanyID>` +
    `\n        <cac:TaxScheme>` +
    `\n          <cbc:ID>VAT</cbc:ID>` +
    `\n        </cac:TaxScheme>` +
    `\n      </cac:PartyTaxScheme>` +
    `\n      <cac:PartyLegalEntity>` +
    `\n        <cbc:RegistrationName>${escapeXml(config.abbr)}</cbc:RegistrationName>` +
    `\n      </cac:PartyLegalEntity>` +
    `\n    </cac:Party>` +
    `\n  </cac:AccountingSupplierParty>`
  );
}

function buildAccountingCustomerParty(
  customer: InvoiceCustomer,
  invoiceSubType: InvoiceSubType,
): string {
  const isStandard = invoiceSubType === '0100000';
  const buyerTaxId = isValidSaudiVat(customer.taxId) ? digitsOnly(customer.taxId) : '';
  const otherBuyerId = (customer.buyerId ?? '').trim();
  const buyerIdType = (customer.buyerIdType ?? '').trim().toUpperCase();
  const buyerSchemeId =
    buyerIdType === 'CRN'
      ? isLikelyCrn(otherBuyerId)
        ? 'CRN'
        : 'NAT'
      : buyerIdType === 'TIN'
        ? 'TIN'
        : 'NAT';

  const streetName = sanitizeText(customer.address?.streetName, 'N/A');
  const cityName = sanitizeText(customer.address?.cityName, 'N/A');
  const districtName = sanitizeText(customer.address?.citySubdivisionName ?? cityName, cityName);
  const buildingNumber = normalizeBuildingNumber(customer.address?.buildingNumber);
  const postalZone = normalizeSaudiPostalCode(customer.address?.postalZone);
  const countryCode = sanitizeText(customer.address?.countryCode, 'SA', 2).toUpperCase();

  const partyIdentificationXml =
    isStandard && !buyerTaxId && otherBuyerId
      ? `\n      <cac:PartyIdentification>` +
        `\n        <cbc:ID schemeID="${escapeXml(buyerSchemeId)}">${escapeXml(otherBuyerId)}</cbc:ID>` +
        `\n      </cac:PartyIdentification>`
      : '';

  const partyTaxSchemeCompanyIdXml = buyerTaxId
    ? `\n        <cbc:CompanyID>${escapeXml(buyerTaxId)}</cbc:CompanyID>`
    : '';

  return (
    `\n  <cac:AccountingCustomerParty>` +
    `\n    <cac:Party>` +
    partyIdentificationXml +
    `\n      <cac:PostalAddress>` +
    `\n        <cbc:StreetName>${escapeXml(streetName)}</cbc:StreetName>` +
    `\n        <cbc:BuildingNumber>${escapeXml(buildingNumber)}</cbc:BuildingNumber>` +
    `\n        <cbc:CitySubdivisionName>${escapeXml(districtName)}</cbc:CitySubdivisionName>` +
    `\n        <cbc:CityName>${escapeXml(cityName)}</cbc:CityName>` +
    `\n        <cbc:PostalZone>${escapeXml(postalZone)}</cbc:PostalZone>` +
    `\n        <cac:Country>` +
    `\n          <cbc:IdentificationCode>${escapeXml(countryCode)}</cbc:IdentificationCode>` +
    `\n        </cac:Country>` +
    `\n      </cac:PostalAddress>` +
    `\n      <cac:PartyTaxScheme>` +
    partyTaxSchemeCompanyIdXml +
    `\n        <cac:TaxScheme>` +
    `\n          <cbc:ID>VAT</cbc:ID>` +
    `\n        </cac:TaxScheme>` +
    `\n      </cac:PartyTaxScheme>` +
    `\n      <cac:PartyLegalEntity>` +
    `\n        <cbc:RegistrationName>${escapeXml(customer.name ?? customer.id ?? 'Customer')}</cbc:RegistrationName>` +
    `\n      </cac:PartyLegalEntity>` +
    `\n    </cac:Party>` +
    `\n  </cac:AccountingCustomerParty>`
  );
}

function buildDeliveryAndPayment(invoiceDate: Date): string {
  return (
    `\n  <cac:Delivery>` +
    `\n    <cbc:ActualDeliveryDate>${formatDate(invoiceDate)}</cbc:ActualDeliveryDate>` +
    `\n  </cac:Delivery>` +
    `\n  <cac:PaymentMeans>` +
    `\n    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>` +
    `\n  </cac:PaymentMeans>`
  );
}

function buildAllowanceCharges(subtotals: InvoiceTaxSubtotal[]): string {
  return subtotals
    .filter((subtotal) => subtotal.discountAmount > 0)
    .map(
      (subtotal) =>
        `\n  <cac:AllowanceCharge>` +
        `\n    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>` +
        `\n    <cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode>` +
        `\n    <cbc:AllowanceChargeReason>Loyalty Discount</cbc:AllowanceChargeReason>` +
        `\n    <cbc:Amount currencyID="SAR">${fmt(subtotal.discountAmount)}</cbc:Amount>` +
        `\n    <cac:TaxCategory>` +
        `\n      <cbc:ID>${subtotal.taxCategoryId}</cbc:ID>` +
        `\n      <cbc:Percent>${fmt(subtotal.taxPercent)}</cbc:Percent>` +
        `\n      <cac:TaxScheme>` +
        `\n        <cbc:ID>VAT</cbc:ID>` +
        `\n      </cac:TaxScheme>` +
        `\n    </cac:TaxCategory>` +
        `\n  </cac:AllowanceCharge>`,
    )
    .join('');
}

function buildTaxTotals(totalTax: number, subtotals: InvoiceTaxSubtotal[]): string {
  const taxSubtotalsXml = subtotals
    .map(
      (subtotal) =>
        `\n    <cac:TaxSubtotal>` +
        `\n      <cbc:TaxableAmount currencyID="SAR">${fmt(subtotal.taxableAmount)}</cbc:TaxableAmount>` +
        `\n      <cbc:TaxAmount currencyID="SAR">${fmt(subtotal.taxAmount)}</cbc:TaxAmount>` +
        `\n      <cac:TaxCategory>` +
        `\n        <cbc:ID>${subtotal.taxCategoryId}</cbc:ID>` +
        `\n        <cbc:Percent>${fmt(subtotal.taxPercent)}</cbc:Percent>` +
        `\n        <cac:TaxScheme>` +
        `\n          <cbc:ID>VAT</cbc:ID>` +
        `\n        </cac:TaxScheme>` +
        `\n      </cac:TaxCategory>` +
        `\n    </cac:TaxSubtotal>`,
    )
    .join('');

  return (
    `\n  <cac:TaxTotal>` +
    `\n    <cbc:TaxAmount currencyID="SAR">${fmt(totalTax)}</cbc:TaxAmount>` +
    `\n  </cac:TaxTotal>` +
    `\n  <cac:TaxTotal>` +
    `\n    <cbc:TaxAmount currencyID="SAR">${fmt(totalTax)}</cbc:TaxAmount>` +
    taxSubtotalsXml +
    `\n  </cac:TaxTotal>`
  );
}

function buildLegalMonetaryTotal(
  totalExclusiveAmount: number,
  taxExclusiveAmount: number,
  taxInclusiveAmount: number,
  discount: number,
): string {
  return (
    `\n  <cac:LegalMonetaryTotal>` +
    `\n    <cbc:LineExtensionAmount currencyID="SAR">${fmt(totalExclusiveAmount)}</cbc:LineExtensionAmount>` +
    `\n    <cbc:TaxExclusiveAmount currencyID="SAR">${fmt(taxExclusiveAmount)}</cbc:TaxExclusiveAmount>` +
    `\n    <cbc:TaxInclusiveAmount currencyID="SAR">${fmt(taxInclusiveAmount)}</cbc:TaxInclusiveAmount>` +
    `\n    <cbc:AllowanceTotalAmount currencyID="SAR">${fmt(discount)}</cbc:AllowanceTotalAmount>` +
    `\n    <cbc:PayableAmount currencyID="SAR">${fmt(taxInclusiveAmount)}</cbc:PayableAmount>` +
    `\n  </cac:LegalMonetaryTotal>`
  );
}

function buildInvoiceLines(linesData: InvoiceLineAmounts[]): string {
  let lines = '';
  for (let i = 0; i < linesData.length; i++) {
    const line = linesData[i];

    lines +=
      `\n  <cac:InvoiceLine>` +
      `\n    <cbc:ID>${i + 1}</cbc:ID>` +
      `\n    <cbc:InvoicedQuantity unitCode="${escapeXml(line.unitCode)}">${fmt(line.quantity)}</cbc:InvoicedQuantity>` +
      `\n    <cbc:LineExtensionAmount currencyID="SAR">${fmt(line.lineExtensionAmount)}</cbc:LineExtensionAmount>` +
      `\n    <cac:TaxTotal>` +
      `\n      <cbc:TaxAmount currencyID="SAR">${fmt(line.taxAmount)}</cbc:TaxAmount>` +
      `\n      <cbc:RoundingAmount currencyID="SAR">${fmt(line.roundingAmount)}</cbc:RoundingAmount>` +
      `\n    </cac:TaxTotal>` +
      `\n    <cac:Item>` +
      `\n      <cbc:Name>${escapeXml(line.itemName)}</cbc:Name>` +
      `\n      <cac:ClassifiedTaxCategory>` +
      `\n        <cbc:ID>${line.taxCategoryId}</cbc:ID>` +
      `\n        <cbc:Percent>${fmt(line.taxPercent)}</cbc:Percent>` +
      `\n        <cac:TaxScheme>` +
      `\n          <cbc:ID>VAT</cbc:ID>` +
      `\n        </cac:TaxScheme>` +
      `\n      </cac:ClassifiedTaxCategory>` +
      `\n    </cac:Item>` +
      `\n    <cac:Price>` +
      `\n      <cbc:PriceAmount currencyID="SAR">${fmt(line.priceAmount)}</cbc:PriceAmount>` +
      `\n    </cac:Price>` +
      `\n  </cac:InvoiceLine>`;
  }
  return lines;
}

// --- UBL Extension (Digital Signature) ---

export function buildUBLExtension(
  invoiceHash: string,
  signedPropertiesHash: string,
  signatureValue: string,
  certificateContent: string,
): string {
  return (
    `\n  <ext:UBLExtensions>` +
    `\n    <ext:UBLExtension>` +
    `\n      <ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI>` +
    `\n      <ext:ExtensionContent>` +
    `\n        <sig:UBLDocumentSignatures xmlns:sig="urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2" xmlns:sac="urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2" xmlns:sbc="urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2">` +
    `\n          <sac:SignatureInformation>` +
    `\n            <cbc:ID>urn:oasis:names:specification:ubl:signature:1</cbc:ID>` +
    `\n            <sbc:ReferencedSignatureID>urn:oasis:names:specification:ubl:signature:Invoice</sbc:ReferencedSignatureID>` +
    `\n            <ds:Signature xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Id="signature">` +
    `\n              <ds:SignedInfo>` +
    `\n                <ds:CanonicalizationMethod Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>` +
    `\n                <ds:SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256"/>` +
    `\n                <ds:Reference Id="invoiceSignedData" URI="">` +
    `\n                  <ds:Transforms>` +
    `\n                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
    `\n                      <ds:XPath>not(//ancestor-or-self::ext:UBLExtensions)</ds:XPath>` +
    `\n                    </ds:Transform>` +
    `\n                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
    `\n                      <ds:XPath>not(//ancestor-or-self::cac:Signature)</ds:XPath>` +
    `\n                    </ds:Transform>` +
    `\n                    <ds:Transform Algorithm="http://www.w3.org/TR/1999/REC-xpath-19991116">` +
    `\n                      <ds:XPath>not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])</ds:XPath>` +
    `\n                    </ds:Transform>` +
    `\n                    <ds:Transform Algorithm="http://www.w3.org/2006/12/xml-c14n11"/>` +
    `\n                  </ds:Transforms>` +
    `\n                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `\n                  <ds:DigestValue>${invoiceHash}</ds:DigestValue>` +
    `\n                </ds:Reference>` +
    `\n                <ds:Reference URI="#xadesSignedProperties" Type="http://www.w3.org/2000/09/xmldsig#SignatureProperties">` +
    `\n                  <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `\n                  <ds:DigestValue>${signedPropertiesHash}</ds:DigestValue>` +
    `\n                </ds:Reference>` +
    `\n              </ds:SignedInfo>` +
    `\n              <ds:SignatureValue>${signatureValue}</ds:SignatureValue>` +
    `\n              <ds:KeyInfo>` +
    `\n                <ds:X509Data>` +
    `\n                  <ds:X509Certificate>${certificateContent}</ds:X509Certificate>` +
    `\n                </ds:X509Data>` +
    `\n              </ds:KeyInfo>` +
    `\n            </ds:Signature>` +
    `\n          </sac:SignatureInformation>` +
    `\n        </sig:UBLDocumentSignatures>` +
    `\n      </ext:ExtensionContent>` +
    `\n    </ext:UBLExtension>` +
    `\n  </ext:UBLExtensions>`
  );
}

export function buildSignedPropertiesObject(
  signingTime: string,
  certDigestValue: string,
  issuerName: string,
  serialNumber: string,
): string {
  return (
    `\n              <ds:Object>` +
    `\n                <xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">` +
    `\n                  <xades:SignedProperties Id="xadesSignedProperties">` +
    `\n                    <xades:SignedSignatureProperties>` +
    `\n                      <xades:SigningTime>${signingTime}</xades:SigningTime>` +
    `\n                      <xades:SigningCertificate>` +
    `\n                        <xades:Cert>` +
    `\n                          <xades:CertDigest>` +
    `\n                            <ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>` +
    `\n                            <ds:DigestValue>${certDigestValue}</ds:DigestValue>` +
    `\n                          </xades:CertDigest>` +
    `\n                          <xades:IssuerSerial>` +
    `\n                            <ds:X509IssuerName>${escapeXml(issuerName)}</ds:X509IssuerName>` +
    `\n                            <ds:X509SerialNumber>${serialNumber}</ds:X509SerialNumber>` +
    `\n                          </xades:IssuerSerial>` +
    `\n                        </xades:Cert>` +
    `\n                      </xades:SigningCertificate>` +
    `\n                    </xades:SignedSignatureProperties>` +
    `\n                  </xades:SignedProperties>` +
    `\n                </xades:QualifyingProperties>` +
    `\n              </ds:Object>`
  );
}

// --- Billing Reference (Credit Notes) ---

/**
 * Build the BillingReference element for credit notes (type 381).
 * Links the credit note back to the original invoice being returned against.
 */
function buildBillingReference(originalInvoiceId: string): string {
  return (
    `\n  <cac:BillingReference>` +
    `\n    <cac:InvoiceDocumentReference>` +
    `\n      <cbc:ID>${escapeXml(originalInvoiceId)}</cbc:ID>` +
    `\n    </cac:InvoiceDocumentReference>` +
    `\n  </cac:BillingReference>`
  );
}

// --- Main XML Builder ---

export interface BuildInvoiceXmlParams {
  invoiceNumber: string;
  invoiceDate: Date;
  uuid: string;
  invoiceTypeCode: InvoiceTypeCode;
  invoiceSubType: InvoiceSubType;
  previousInvoiceHash: string;
  customer: InvoiceCustomer;
  cartItems: CartItem[];
  tax: number;
  totalExcludeTax: number;
  discount: number;
  config: ZatcaConfig;
  billingReference?: string; // original invoice ID for credit notes (type 381)
}

/**
 * Build the base invoice XML (without UBLExtension — that gets added after hashing).
 */
export function buildBaseInvoiceXml(params: BuildInvoiceXmlParams): string {
  const {
    invoiceNumber,
    invoiceDate,
    uuid,
    invoiceTypeCode,
    invoiceSubType,
    previousInvoiceHash,
    customer,
    cartItems,
    discount,
    config,
    billingReference,
  } = params;
  const breakdown = calculateInvoiceTaxBreakdown(cartItems, config.isTaxIncludedInPrice, discount);

  const xmlns = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const xmlns_cac = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
  const xmlns_cbc = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
  const xmlns_ext = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>`;
  xml += `\n<Invoice xmlns="${xmlns}" xmlns:cac="${xmlns_cac}" xmlns:cbc="${xmlns_cbc}" xmlns:ext="${xmlns_ext}">`;
  xml += buildBaseXmlTags(invoiceNumber, invoiceDate, uuid, invoiceTypeCode, invoiceSubType);
  // BillingReference: required for credit notes (type 381) to link back to original invoice
  if (billingReference) {
    xml += buildBillingReference(billingReference);
  }
  xml += buildAdditionalReferenceTags(invoiceNumber, previousInvoiceHash);
  xml += buildQRTag();
  xml += buildAccountingSupplierParty(config);
  xml += buildAccountingCustomerParty(customer, invoiceSubType);
  xml += buildDeliveryAndPayment(invoiceDate);
  xml += buildAllowanceCharges(breakdown.subtotals);
  xml += buildTaxTotals(breakdown.totalTaxAmount, breakdown.subtotals);
  xml += buildLegalMonetaryTotal(
    breakdown.totalExclusiveAmount,
    breakdown.taxExclusiveAmount,
    breakdown.taxInclusiveAmount,
    breakdown.allowanceAmount,
  );
  xml += buildInvoiceLines(breakdown.lines);
  xml += `\n</Invoice>\n`;

  return xml;
}

/**
 * Insert the UBLExtension at the beginning of the Invoice element (before ProfileID).
 */
export function insertUBLExtension(xml: string, ublExtension: string): string {
  // Insert after the opening <Invoice ...> tag
  const insertPoint = xml.indexOf('>', xml.indexOf('<Invoice')) + 1;
  return xml.slice(0, insertPoint) + ublExtension + xml.slice(insertPoint);
}

/**
 * Insert the ds:Object (signed properties) after </ds:KeyInfo> in the XML.
 */
export function insertSignedPropertiesObject(xml: string, objectXml: string): string {
  const keyInfoEnd = '</ds:KeyInfo>';
  const idx = xml.indexOf(keyInfoEnd);
  if (idx === -1) return xml;
  const insertPos = idx + keyInfoEnd.length;
  return xml.slice(0, insertPos) + objectXml + xml.slice(insertPos);
}

/**
 * Update the QR placeholder with the actual QR data.
 */
export function updateQRData(xml: string, qrData: string): string {
  return xml.replace('PLACEHOLDER_QR', qrData);
}
