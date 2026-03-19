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

function calculateTax(amountIncludingTax: number, taxPercent: number): TaxCalc {
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
  const otherBuyerId = (customer.buyerId ?? customer.id ?? '').trim();
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
    `\n        <cbc:RegistrationName>${escapeXml(customer.id)}</cbc:RegistrationName>` +
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

function buildAllowanceCharge(totalTax: number, discount: number): string {
  const taxCategoryId = discount > 0 ? 'Z' : 'S';
  return (
    `\n  <cac:AllowanceCharge>` +
    `\n    <cbc:ChargeIndicator>false</cbc:ChargeIndicator>` +
    `\n    <cbc:AllowanceChargeReasonCode>95</cbc:AllowanceChargeReasonCode>` +
    `\n    <cbc:AllowanceChargeReason>Loyalty Discount</cbc:AllowanceChargeReason>` +
    `\n    <cbc:Amount currencyID="SAR">${fmt(discount)}</cbc:Amount>` +
    `\n    <cac:TaxCategory>` +
    `\n      <cbc:ID>${taxCategoryId}</cbc:ID>` +
    `\n      <cbc:Percent>15.00</cbc:Percent>` +
    `\n      <cac:TaxScheme>` +
    `\n        <cbc:ID>VAT</cbc:ID>` +
    `\n      </cac:TaxScheme>` +
    `\n    </cac:TaxCategory>` +
    `\n  </cac:AllowanceCharge>` +
    `\n  <cac:TaxTotal>` +
    `\n    <cbc:TaxAmount currencyID="SAR">${fmt(totalTax)}</cbc:TaxAmount>` +
    `\n  </cac:TaxTotal>`
  );
}

function buildTaxTotalWithSubtotal(totalTax: number, taxableAmount: number): string {
  return (
    `\n  <cac:TaxTotal>` +
    `\n    <cbc:TaxAmount currencyID="SAR">${fmt(totalTax)}</cbc:TaxAmount>` +
    `\n    <cac:TaxSubtotal>` +
    `\n      <cbc:TaxableAmount currencyID="SAR">${fmt(taxableAmount)}</cbc:TaxableAmount>` +
    `\n      <cbc:TaxAmount currencyID="SAR">${fmt(totalTax)}</cbc:TaxAmount>` +
    `\n      <cac:TaxCategory>` +
    `\n        <cbc:ID>S</cbc:ID>` +
    `\n        <cbc:Percent>15.00</cbc:Percent>` +
    `\n        <cac:TaxScheme>` +
    `\n          <cbc:ID>VAT</cbc:ID>` +
    `\n        </cac:TaxScheme>` +
    `\n      </cac:TaxCategory>` +
    `\n    </cac:TaxSubtotal>` +
    `\n  </cac:TaxTotal>`
  );
}

function buildLegalMonetaryTotal(
  totalTax: number,
  totalExcludeTax: number,
  discount: number,
): string {
  const taxInclusive = totalExcludeTax + totalTax;
  const payable = taxInclusive - discount;
  return (
    `\n  <cac:LegalMonetaryTotal>` +
    `\n    <cbc:LineExtensionAmount currencyID="SAR">${fmt(totalExcludeTax)}</cbc:LineExtensionAmount>` +
    `\n    <cbc:TaxExclusiveAmount currencyID="SAR">${fmt(totalExcludeTax)}</cbc:TaxExclusiveAmount>` +
    `\n    <cbc:TaxInclusiveAmount currencyID="SAR">${fmt(taxInclusive)}</cbc:TaxInclusiveAmount>` +
    `\n    <cbc:AllowanceTotalAmount currencyID="SAR">${fmt(discount)}</cbc:AllowanceTotalAmount>` +
    `\n    <cbc:PayableAmount currencyID="SAR">${fmt(payable)}</cbc:PayableAmount>` +
    `\n  </cac:LegalMonetaryTotal>`
  );
}

function buildInvoiceLines(cartItems: CartItem[], isTaxIncluded: boolean): string {
  const vatRate = 15;
  let lines = '';
  for (let i = 0; i < cartItems.length; i++) {
    const item = cartItems[i];
    const itemPrice = item.product.uomPrice ?? item.product.price ?? 0;
    const quantity = item.quantity;
    const unitCode = item.product.uom || 'PCE';

    let tax: number;
    let lineExtension: number;
    let pricePerUnit: number;
    let roundingAmount: number;

    if (isTaxIncluded) {
      const grossLine = round2(quantity * itemPrice);
      const taxCalc = calculateTax(grossLine, vatRate);
      tax = round2(taxCalc.taxAmount);
      lineExtension = round2(grossLine - tax);
      pricePerUnit = round2(calculateTax(itemPrice, vatRate).productPrice);
      roundingAmount = grossLine;
    } else {
      lineExtension = round2(quantity * itemPrice);
      tax = round2((lineExtension * vatRate) / 100);
      pricePerUnit = round2(itemPrice);
      roundingAmount = round2(lineExtension + tax);
    }

    lines +=
      `\n  <cac:InvoiceLine>` +
      `\n    <cbc:ID>${i + 1}</cbc:ID>` +
      `\n    <cbc:InvoicedQuantity unitCode="${escapeXml(unitCode)}">${fmt(quantity)}</cbc:InvoicedQuantity>` +
      `\n    <cbc:LineExtensionAmount currencyID="SAR">${fmt(lineExtension)}</cbc:LineExtensionAmount>` +
      `\n    <cac:TaxTotal>` +
      `\n      <cbc:TaxAmount currencyID="SAR">${fmt(tax)}</cbc:TaxAmount>` +
      `\n      <cbc:RoundingAmount currencyID="SAR">${fmt(roundingAmount)}</cbc:RoundingAmount>` +
      `\n    </cac:TaxTotal>` +
      `\n    <cac:Item>` +
      `\n      <cbc:Name>${escapeXml(item.product.name || 'Item')}</cbc:Name>` +
      `\n      <cac:ClassifiedTaxCategory>` +
      `\n        <cbc:ID>S</cbc:ID>` +
      `\n        <cbc:Percent>15.00</cbc:Percent>` +
      `\n        <cac:TaxScheme>` +
      `\n          <cbc:ID>VAT</cbc:ID>` +
      `\n        </cac:TaxScheme>` +
      `\n      </cac:ClassifiedTaxCategory>` +
      `\n    </cac:Item>` +
      `\n    <cac:Price>` +
      `\n      <cbc:PriceAmount currencyID="SAR">${fmt(pricePerUnit)}</cbc:PriceAmount>` +
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
    tax,
    totalExcludeTax,
    discount,
    config,
  } = params;

  const xmlns = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  const xmlns_cac = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
  const xmlns_cbc = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
  const xmlns_ext = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';

  let xml = `<?xml version="1.0" encoding="UTF-8"?>`;
  xml += `\n<Invoice xmlns="${xmlns}" xmlns:cac="${xmlns_cac}" xmlns:cbc="${xmlns_cbc}" xmlns:ext="${xmlns_ext}">`;
  xml += buildBaseXmlTags(invoiceNumber, invoiceDate, uuid, invoiceTypeCode, invoiceSubType);
  xml += buildAdditionalReferenceTags(invoiceNumber, previousInvoiceHash);
  xml += buildQRTag();
  xml += buildAccountingSupplierParty(config);
  xml += buildAccountingCustomerParty(customer, invoiceSubType);
  xml += buildDeliveryAndPayment(invoiceDate);
  xml += buildAllowanceCharge(tax, discount);
  xml += buildTaxTotalWithSubtotal(tax, totalExcludeTax);
  xml += buildLegalMonetaryTotal(tax, totalExcludeTax, discount);
  xml += buildInvoiceLines(cartItems, config.isTaxIncludedInPrice);
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
