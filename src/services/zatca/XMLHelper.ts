import { Zatca } from '@/src/utils/constants/app.settings';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import * as Crypto from 'expo-crypto';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as xpath from 'xpath';
import { CertificateUtils } from './certificateUtils';
import { QRUtils } from './QRUtils';
import { InvoiceItem } from './types';
import { savePreviousInvoiceHash } from './zatcaConfig';

export class XMLHelper {
  static xmlns = 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2';
  static xmlns_cac = 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2';
  static xmlns_cbc = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
  static xmlns_ext = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
  static xmlns_sig = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2';
  static xmlns_sac = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2';
  static xmlns_sbc = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2';
  static xmlns_ds = 'http://www.w3.org/2000/09/xmldsig#';

  static hashAlgorithm = 'SHA256';
  static toDecimal(value: number) {
    return Number(value || 0).toFixed(2);
  }
  static async createInvoice(
    invoiceUUID: string,
    customer: any,
    cartItems: InvoiceItem[],
    tax: number,
    totalExcludeTax: number,
    invoiceDate: Date,
    previousInvoiceHash: string,
    invoiceNumber: string,
    discount: number,
  ) {
    try {
      console.log('=================================');
      console.log('[ZATCA] 🚀 Starting Invoice Pipeline');
      console.log('InvoiceUUID:', invoiceUUID);
      console.log('InvoiceNumber:', invoiceNumber);
      console.log('Date:', invoiceDate.toISOString());
      console.log('=================================');

      /* ------------------------------------------------ */
      /* STEP 1: PREPARE CERTIFICATE                      */
      /* ------------------------------------------------ */

      console.log('[STEP 1] Preparing certificate...');
      await CertificateUtils.createPEM();
      console.log('[STEP 1] Certificate ready');

      /* ------------------------------------------------ */
      /* STEP 2: CREATE XML DOCUMENT                      */
      /* ------------------------------------------------ */

      console.log('[STEP 2] Building XML document');

      const doc = new DOMParser().parseFromString('<root/>', 'text/xml');

      const uuid = invoiceUUID; // keep consistent

      const root = doc.createElementNS(this.xmlns, 'Invoice');

      root.setAttribute('xmlns', this.xmlns);
      root.setAttribute('xmlns:cac', this.xmlns_cac);
      root.setAttribute('xmlns:cbc', this.xmlns_cbc);
      root.setAttribute('xmlns:ext', this.xmlns_ext);
      root.setAttribute('xmlns:sig', this.xmlns_sig);
      root.setAttribute('xmlns:sac', this.xmlns_sac);
      root.setAttribute('xmlns:sbc', this.xmlns_sbc);
      root.setAttribute('xmlns:ds', this.xmlns_ds);

      doc.replaceChild(root, doc.documentElement);

      console.log('[STEP 2] Root XML created');

      /* ------------------------------------------------ */
      /* STEP 3: CALCULATE TOTALS                         */
      /* ------------------------------------------------ */

      console.log('[STEP 3] Calculating totals');

      const totals = this.calculateInvoiceTotals(cartItems);

      totalExcludeTax = totals.net;
      const taxTotalAmount = totals.vat;
      const totalIncludeTax = totals.gross;

      console.log('[TOTALS]');
      console.log('Net:', totalExcludeTax);
      console.log('VAT:', taxTotalAmount);
      console.log('Gross:', totalIncludeTax);

      /* ------------------------------------------------ */
      /* STEP 4: BUILD XML BODY                           */
      /* ------------------------------------------------ */

      console.log('[STEP 4] Constructing invoice XML body');

      this.CreateBaseXMLTags(doc, root, invoiceNumber, invoiceDate, uuid);
      this.CreateAdditionalReferenceXMLTags(doc, root, invoiceNumber, previousInvoiceHash);

      this.AddAccountingSupplierParty(doc, root);
      this.AddAccountingCustomerParty(doc, root, customer);

      this.CreateDeliveryAndPaymentTags(doc, root, invoiceDate);

      this.CreateAllowanceTags(doc, root, taxTotalAmount, discount);

      this.CreateTaxTotalWithSubTotal(doc, root, taxTotalAmount, totalExcludeTax);

      this.CreateLegalMonetaryTotalTags(doc, root, taxTotalAmount, totalExcludeTax, discount);

      this.CreateItemsTag(doc, root, cartItems);

      console.log('[STEP 4] XML body complete');

      /* ------------------------------------------------ */
      /* STEP 5: SAVE TEMP XML                            */
      /* ------------------------------------------------ */

      console.log('[STEP 5] Writing temp XML');

      const dir = new Directory(Paths.document, 'invoices', invoiceUUID);

      if (!dir.exists) {
        console.log('[STEP 5] Creating invoice directory:', dir.uri);
        await dir.create({ intermediates: true });
      }

      const tempFile = new File(dir, 'temp.xml');

      const serializer = new XMLSerializer();

      let xmlText = serializer.serializeToString(doc);

      xmlText = xmlText
        .replace('<cbc:ProfileID>', '\n  <cbc:ProfileID>')
        .replace('<cac:AccountingSupplierParty>', '\n  \n  <cac:AccountingSupplierParty>')
        .replace('</Invoice>', '</Invoice>\n');

      await tempFile.write(xmlText);

      console.log('[STEP 5] Temp XML written:', tempFile.uri);

      /* IMPORTANT: reload XML from file for canonicalization */
      const tempXmlContent = await tempFile.text();
      /* ------------------------------------------------ */
      /* STEP 6: CANONICALIZE XML                         */
      /* ------------------------------------------------ */

      console.log('[STEP 6] Canonicalizing XML');

      const canonicalXml = await this.CanonicalizeXml(tempXmlContent);

      console.log('[STEP 6] Canonical XML length:', canonicalXml.length);

      /* ------------------------------------------------ */
      /* STEP 7: GENERATE INVOICE HASH                    */
      /* ------------------------------------------------ */

      console.log('[STEP 7] Generating invoice hash');

      const invoiceHash = await this.GetInvoiceHash(canonicalXml);

      console.log('[HASH HEX]', invoiceHash.hex);
      console.log('[HASH BASE64]', invoiceHash.base64);

      /* ------------------------------------------------ */
      /* STEP 8: CERTIFICATE DATA                         */
      /* ------------------------------------------------ */

      console.log('[STEP 8] Extracting certificate info');

      const certificateDigestValue = await CertificateUtils.getDigestValue();
      const issuerName = await CertificateUtils.getCertificateIssuer();
      const serialNumber = await CertificateUtils.getSerialNumber();

      console.log('CertDigest:', certificateDigestValue);
      console.log('Issuer:', issuerName);
      console.log('Serial:', serialNumber);

      if (!certificateDigestValue || !issuerName || !serialNumber) {
        throw new Error('Certificate info missing');
      }

      /* ------------------------------------------------ */
      /* STEP 9: SIGNED PROPERTIES HASH                   */
      /* ------------------------------------------------ */

      console.log('[STEP 9] Generating SignedProperties hash');

      const formattedDate = invoiceDate.toISOString().slice(0, 19);

      const signedPropertiesHash = await this.GenerateSignedPropertiesHash(
        formattedDate,
        issuerName,
        serialNumber,
        certificateDigestValue,
      );

      console.log('SignedPropertiesHash:', signedPropertiesHash);

      /* ------------------------------------------------ */
      /* STEP 10: SIGN INVOICE HASH                       */
      /* ------------------------------------------------ */

      console.log('[STEP 10] Signing invoice hash');

      const invoiceSignature = await CertificateUtils.SignHashWithECDSABytes(invoiceHash.hex);

      const signatureBase64 = Buffer.from(invoiceSignature).toString('base64');

      console.log('Signature (base64):', signatureBase64);

      /* ------------------------------------------------ */
      /* STEP 11: CREATE UBL EXTENSION                    */
      /* ------------------------------------------------ */

      console.log('[STEP 11] Creating UBL extension');

      this.CreateUBLExtension(
        invoiceUUID,
        doc,
        root,
        invoiceDate,
        invoiceHash.base64,
        signedPropertiesHash,
        signatureBase64,
      );

      /* ------------------------------------------------ */
      /* STEP 12: ADD QR TAG                              */
      /* ------------------------------------------------ */

      console.log('[STEP 12] Adding QR XML tag');

      this.AddQRTag(doc, root);

      /* ------------------------------------------------ */
      /* STEP 13: SAVE FINAL XML                          */
      /* ------------------------------------------------ */

      console.log('[STEP 13] Writing final XML');

      const finalFile = new File(dir, `${invoiceUUID}.xml`);

      const finalXml = serializer.serializeToString(doc);

      await finalFile.write(finalXml);

      console.log('[STEP 13] Final XML saved:', finalFile.uri);

      /* ------------------------------------------------ */
      /* STEP 14: GENERATE QR DATA                        */
      /* ------------------------------------------------ */

      console.log('[STEP 14] Generating QR TLV');

      const qrData = await QRUtils.GetQRString(
        invoiceHash.base64,
        formattedDate,
        totalExcludeTax + taxTotalAmount,
        taxTotalAmount,
        invoiceSignature,
      );
      await this.UpdateXML(finalFile.uri, qrData);
      console.log('[STEP 14] QR TLV generated');

      /* ------------------------------------------------ */
      /* STEP 15: SAVE QR IMAGE                           */
      /* ------------------------------------------------ */

      console.log('[STEP 15] Saving QR');

      await QRUtils.saveQR(qrData, invoiceUUID);

      console.log('[STEP 15] QR saved');

      console.log('=================================');
      console.log('[ZATCA] ✅ Invoice pipeline completed');
      console.log('=================================');

      return {
        xml: finalXml,
        hash: invoiceHash.base64,
        signature: signatureBase64,
        qrBase64: qrData,
        fileUri: finalFile.uri,
      };
    } catch (error: any) {
      console.error('=================================');
      console.error('[ZATCA] ❌ Invoice pipeline failed');
      console.error('Message:', error?.message);
      console.error('Stack:', error?.stack);
      console.error('Full Error:', JSON.stringify(error, null, 2));
      console.error('=================================');

      throw error;
    }
  }

  static CreateBaseXMLTags(
    doc: Document,
    root: Element,
    invoiceNumber: string,
    invoiceDate: Date,
    uuidValue: string,
  ) {
    const profileId = doc.createElementNS(this.xmlns_cbc, 'cbc:ProfileID');
    profileId.textContent = 'reporting:1.0';
    root.appendChild(profileId);

    const id = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    id.textContent = `ACC-SINV-${new Date().getFullYear()}-${invoiceNumber}`;
    root.appendChild(id);

    const uuid = doc.createElementNS(this.xmlns_cbc, 'cbc:UUID');
    uuid.textContent = uuidValue;
    root.appendChild(uuid);

    const issueDate = doc.createElementNS(this.xmlns_cbc, 'cbc:IssueDate');
    issueDate.textContent = invoiceDate.toISOString().slice(0, 10);
    root.appendChild(issueDate);

    const issueTime = doc.createElementNS(this.xmlns_cbc, 'cbc:IssueTime');
    issueTime.textContent = invoiceDate.toISOString().slice(11, 19);
    root.appendChild(issueTime);

    const invoiceTypeCode = doc.createElementNS(this.xmlns_cbc, 'cbc:InvoiceTypeCode');
    invoiceTypeCode.setAttribute('name', '0200000');
    invoiceTypeCode.textContent = '388';
    root.appendChild(invoiceTypeCode);

    const documentCurrencyCode = doc.createElementNS(this.xmlns_cbc, 'cbc:DocumentCurrencyCode');
    documentCurrencyCode.textContent = 'SAR';
    root.appendChild(documentCurrencyCode);

    const taxCurrencyCode = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxCurrencyCode');
    taxCurrencyCode.textContent = 'SAR';
    root.appendChild(taxCurrencyCode);
  }

  static CreateAdditionalReferenceXMLTags(
    doc: Document,
    root: Element,
    invoiceNumberPart: string,
    previousInvoiceHash: string,
  ) {
    // ICV
    const documentICV = doc.createElementNS(this.xmlns_cac, 'cac:AdditionalDocumentReference');
    root.appendChild(documentICV);

    const documentICVID = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    documentICVID.textContent = 'ICV';
    documentICV.appendChild(documentICVID);

    const uuid = doc.createElementNS(this.xmlns_cbc, 'cbc:UUID');

    // remove non-numeric characters
    const numbers = invoiceNumberPart.replace(/[^0-9]/g, '');

    uuid.textContent = numbers;
    documentICV.appendChild(uuid);

    // PIH
    const documentPih = doc.createElementNS(this.xmlns_cac, 'cac:AdditionalDocumentReference');
    root.appendChild(documentPih);

    const pIhId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    pIhId.textContent = 'PIH';
    documentPih.appendChild(pIhId);

    const pihAttachment = doc.createElementNS(this.xmlns_cac, 'cac:Attachment');
    documentPih.appendChild(pihAttachment);

    const pihEmbedded = doc.createElementNS(this.xmlns_cbc, 'cbc:EmbeddedDocumentBinaryObject');

    pihEmbedded.setAttribute('mimeCode', 'text/plain');
    pihEmbedded.textContent = previousInvoiceHash;

    pihAttachment.appendChild(pihEmbedded);
  }
  static AddQRTag(doc: Document, root: Element) {
    // QR block
    const documentQR = doc.createElementNS(this.xmlns_cac, 'cac:AdditionalDocumentReference');

    const qrID = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    qrID.textContent = 'QR';
    documentQR.appendChild(qrID);

    const qrAttachment = doc.createElementNS(this.xmlns_cac, 'cac:Attachment');
    documentQR.appendChild(qrAttachment);

    const qrEmbedded = doc.createElementNS(this.xmlns_cbc, 'cbc:EmbeddedDocumentBinaryObject');

    qrEmbedded.setAttribute('mimeCode', 'text/plain');

    // placeholder (will be replaced later by UpdateXML)
    qrEmbedded.textContent = 'GsiuvGjvchjbFhibcDhjv1886G';

    qrAttachment.appendChild(qrEmbedded);

    // Signature block
    const signature = doc.createElementNS(this.xmlns_cac, 'cac:Signature');

    const signatureId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    signatureId.textContent = 'urn:oasis:names:specification:ubl:signature:Invoice';

    signature.appendChild(signatureId);

    const signatureMethod = doc.createElementNS(this.xmlns_cbc, 'cbc:SignatureMethod');

    signatureMethod.textContent = 'urn:oasis:names:specification:ubl:dsig:enveloped:xades';

    signature.appendChild(signatureMethod);

    const select = xpath.useNamespaces({
      cac: this.xmlns_cac,
      cbc: this.xmlns_cbc,
    });

    const nodes = select('//cac:AccountingSupplierParty', doc) as Node[];

    const targetNode = nodes[0];

    if (targetNode && targetNode.parentNode) {
      targetNode.parentNode.insertBefore(documentQR, targetNode);
      targetNode.parentNode.insertBefore(signature, targetNode);
    }
  }
  static AddAccountingSupplierParty(doc: Document, parent: Element) {
    const accountingSupplierParty = doc.createElementNS(
      this.xmlns_cac,
      'cac:AccountingSupplierParty',
    );
    parent.appendChild(accountingSupplierParty);

    const party = doc.createElementNS(this.xmlns_cac, 'cac:Party');
    accountingSupplierParty.appendChild(party);

    const partyIdentification = doc.createElementNS(this.xmlns_cac, 'cac:PartyIdentification');
    party.appendChild(partyIdentification);

    const partyIdentificationId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    partyIdentificationId.setAttribute('schemeID', 'CRN');
    partyIdentificationId.textContent = Zatca.CompanyRegistrationNo;
    partyIdentification.appendChild(partyIdentificationId);

    const postalAddress = doc.createElementNS(this.xmlns_cac, 'cac:PostalAddress');
    party.appendChild(postalAddress);

    this.CreateElementWithText(
      doc,
      postalAddress,
      'cbc',
      'StreetName',
      this.xmlns_cbc,
      Zatca.Address.AddressLine1,
    );

    this.CreateElementWithText(
      doc,
      postalAddress,
      'cbc',
      'BuildingNumber',
      this.xmlns_cbc,
      Zatca.Address.BuildingNumber.toString() ?? '0',
    );

    this.CreateElementWithText(
      doc,
      postalAddress,
      'cbc',
      'PlotIdentification',
      this.xmlns_cbc,
      Zatca.Address.AddressLine1,
    );

    this.CreateElementWithText(
      doc,
      postalAddress,
      'cbc',
      'CitySubdivisionName',
      this.xmlns_cbc,
      Zatca.Address.City,
    );

    this.CreateElementWithText(
      doc,
      postalAddress,
      'cbc',
      'CityName',
      this.xmlns_cbc,
      Zatca.Address.City,
    );

    this.CreateElementWithText(
      doc,
      postalAddress,
      'cbc',
      'PostalZone',
      this.xmlns_cbc,
      Zatca.Address.Pincode.toString() ?? '000000',
    );

    this.CreateElementWithText(
      doc,
      postalAddress,
      'cbc',
      'CountrySubentity',
      this.xmlns_cbc,
      'Saudi Arabia',
    );

    const country = doc.createElementNS(this.xmlns_cac, 'cac:Country');
    postalAddress.appendChild(country);

    this.CreateElementWithText(doc, country, 'cbc', 'IdentificationCode', this.xmlns_cbc, 'SA');

    const partyTaxScheme = doc.createElementNS(this.xmlns_cac, 'cac:PartyTaxScheme');
    party.appendChild(partyTaxScheme);

    this.CreateElementWithText(
      doc,
      partyTaxScheme,
      'cbc',
      'CompanyID',
      this.xmlns_cbc,
      Zatca.TaxId,
    );

    const taxScheme = doc.createElementNS(this.xmlns_cac, 'cac:TaxScheme');
    partyTaxScheme.appendChild(taxScheme);

    this.CreateElementWithText(doc, taxScheme, 'cbc', 'ID', this.xmlns_cbc, 'VAT');

    const partyLegalEntity = doc.createElementNS(this.xmlns_cac, 'cac:PartyLegalEntity');
    party.appendChild(partyLegalEntity);

    this.CreateElementWithText(
      doc,
      partyLegalEntity,
      'cbc',
      'RegistrationName',
      this.xmlns_cbc,
      Zatca.Abbr,
    );
  }
  static CreateElementWithText(
    doc: Document,
    parent: Element,
    prefix: string,
    elementName: string,
    xmlns: string,
    textContent: string,
    attributeName?: string,
    attributeValue?: string,
  ) {
    const element = doc.createElementNS(xmlns, `${prefix}:${elementName}`);

    element.textContent = textContent;

    if (attributeName) {
      element.setAttribute(attributeName, attributeValue ?? '');
    }

    parent.appendChild(element);
  }

  static AddAccountingCustomerParty(doc: Document, parent: Element, customer: any) {
    const accountingCustomerParty = doc.createElementNS(
      this.xmlns_cac,
      'cac:AccountingCustomerParty',
    );
    parent.appendChild(accountingCustomerParty);

    const party = doc.createElementNS(this.xmlns_cac, 'cac:Party');
    accountingCustomerParty.appendChild(party);
    const partyIdentification = doc.createElementNS(this.xmlns_cac, 'cac:PartyIdentification');
    party.appendChild(partyIdentification);

    const partyId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    partyId.setAttribute('schemeID', 'OTH');
    partyId.textContent = customer?.vatNumber || customer?.id || '0000000000';

    partyIdentification.appendChild(partyId);
    const partyTaxScheme = doc.createElementNS(this.xmlns_cac, 'cac:PartyTaxScheme');
    party.appendChild(partyTaxScheme);

    const taxScheme = doc.createElementNS(this.xmlns_cac, 'cac:TaxScheme');
    partyTaxScheme.appendChild(taxScheme);

    this.CreateElementWithText(doc, taxScheme, 'cbc', 'ID', this.xmlns_cbc, 'VAT');

    const partyLegalEntity = doc.createElementNS(this.xmlns_cac, 'cac:PartyLegalEntity');

    party.appendChild(partyLegalEntity);

    this.CreateElementWithText(
      doc,
      partyLegalEntity,
      'cbc',
      'RegistrationName',
      this.xmlns_cbc,
      customer?.name || customer?.Id || 'Unknown Customer',
    );
  }
  static CreateDeliveryAndPaymentTags(doc: Document, root: Element, date: Date) {
    const delivery = doc.createElementNS(this.xmlns_cac, 'cac:Delivery');
    root.appendChild(delivery);

    const actualDeliveryDate = doc.createElementNS(this.xmlns_cbc, 'cbc:ActualDeliveryDate');

    // yyyy-MM-dd
    actualDeliveryDate.textContent = date.toISOString().slice(0, 10);

    delivery.appendChild(actualDeliveryDate);

    const paymentMeans = doc.createElementNS(this.xmlns_cac, 'cac:PaymentMeans');

    root.appendChild(paymentMeans);

    const paymentMeansCode = doc.createElementNS(this.xmlns_cbc, 'cbc:PaymentMeansCode');

    paymentMeansCode.textContent = '30';

    paymentMeans.appendChild(paymentMeansCode);
  }

  static CreateAllowanceTags(doc: Document, root: Element, totalTax: number, discount: number) {
    if (discount <= 0) return;

    const allowanceCharge = doc.createElementNS(this.xmlns_cac, 'cac:AllowanceCharge');

    const chargeIndicator = doc.createElementNS(this.xmlns_cbc, 'cbc:ChargeIndicator');
    chargeIndicator.textContent = 'false';
    allowanceCharge.appendChild(chargeIndicator);

    const reasonCode = doc.createElementNS(this.xmlns_cbc, 'cbc:AllowanceChargeReasonCode');
    reasonCode.textContent = '95';
    allowanceCharge.appendChild(reasonCode);

    const reason = doc.createElementNS(this.xmlns_cbc, 'cbc:AllowanceChargeReason');
    reason.textContent = 'Discount';
    allowanceCharge.appendChild(reason);

    const amount = doc.createElementNS(this.xmlns_cbc, 'cbc:Amount');
    amount.setAttribute('currencyID', 'SAR');
    amount.textContent = discount.toFixed(2);
    allowanceCharge.appendChild(amount);

    const taxCategory = doc.createElementNS(this.xmlns_cac, 'cac:TaxCategory');

    const id = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    id.textContent = 'S';
    taxCategory.appendChild(id);

    const percent = doc.createElementNS(this.xmlns_cbc, 'cbc:Percent');
    percent.textContent = '15.00';
    taxCategory.appendChild(percent);

    const taxScheme = doc.createElementNS(this.xmlns_cac, 'cac:TaxScheme');

    const schemeId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    schemeId.textContent = 'VAT';

    taxScheme.appendChild(schemeId);
    taxCategory.appendChild(taxScheme);

    allowanceCharge.appendChild(taxCategory);

    root.appendChild(allowanceCharge);
  }
  static CreateTaxTotalWithSubTotal(
    doc: Document,
    root: Element,
    totalTax: number,
    taxableAmount: number,
  ) {
    const taxTotal = doc.createElementNS(this.xmlns_cac, 'cac:TaxTotal');

    const taxAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxAmount');
    taxAmount.setAttribute('currencyID', 'SAR');
    taxAmount.textContent = totalTax.toFixed(2);
    taxTotal.appendChild(taxAmount);

    const taxSubtotal = doc.createElementNS(this.xmlns_cac, 'cac:TaxSubtotal');

    const taxable = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxableAmount');
    taxable.setAttribute('currencyID', 'SAR');
    taxable.textContent = taxableAmount.toFixed(2);
    taxSubtotal.appendChild(taxable);

    const taxAmount2 = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxAmount');
    taxAmount2.setAttribute('currencyID', 'SAR');
    taxAmount2.textContent = totalTax.toFixed(2);
    taxSubtotal.appendChild(taxAmount2);

    const taxCategory = doc.createElementNS(this.xmlns_cac, 'cac:TaxCategory');

    const id = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    id.textContent = 'S';
    taxCategory.appendChild(id);

    const percent = doc.createElementNS(this.xmlns_cbc, 'cbc:Percent');
    percent.textContent = '15.00';
    taxCategory.appendChild(percent);

    const taxScheme = doc.createElementNS(this.xmlns_cac, 'cac:TaxScheme');

    const schemeId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    schemeId.textContent = 'VAT';

    taxScheme.appendChild(schemeId);
    taxCategory.appendChild(taxScheme);

    taxSubtotal.appendChild(taxCategory);

    taxTotal.appendChild(taxSubtotal);

    root.appendChild(taxTotal);
  }
  static CreateLegalMonetaryTotalTags(
    doc: Document,
    root: Element,
    totalTax: number,
    invoiceAmountExTax: number,
    discount: number,
  ) {
    const legalMonetaryTotal = doc.createElementNS(this.xmlns_cac, 'cac:LegalMonetaryTotal');
    root.appendChild(legalMonetaryTotal);

    const lineExtensionAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:LineExtensionAmount');
    lineExtensionAmount.setAttribute('currencyID', 'SAR');
    lineExtensionAmount.textContent = this.toDecimal(invoiceAmountExTax);
    legalMonetaryTotal.appendChild(lineExtensionAmount);

    const taxExclusiveAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxExclusiveAmount');
    taxExclusiveAmount.setAttribute('currencyID', 'SAR');
    taxExclusiveAmount.textContent = this.toDecimal(invoiceAmountExTax);
    legalMonetaryTotal.appendChild(taxExclusiveAmount);

    const taxInclusiveAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxInclusiveAmount');
    taxInclusiveAmount.setAttribute('currencyID', 'SAR');
    taxInclusiveAmount.textContent = this.toDecimal(invoiceAmountExTax + totalTax);
    legalMonetaryTotal.appendChild(taxInclusiveAmount);

    const allowanceTotalAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:AllowanceTotalAmount');
    allowanceTotalAmount.setAttribute('currencyID', 'SAR');
    allowanceTotalAmount.textContent = this.toDecimal(discount);
    legalMonetaryTotal.appendChild(allowanceTotalAmount);

    const payableAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:PayableAmount');
    payableAmount.setAttribute('currencyID', 'SAR');
    payableAmount.textContent = this.toDecimal(invoiceAmountExTax + totalTax - discount);
    legalMonetaryTotal.appendChild(payableAmount);
  }
  static CreateItemsTag(doc: Document, root: Element, items: InvoiceItem[]) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      const invoiceLine = doc.createElementNS(this.xmlns_cac, 'cac:InvoiceLine');

      const invoiceId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
      invoiceId.textContent = String(i + 1);
      invoiceLine.appendChild(invoiceId);

      /* ---------------------------
       Quantity
    --------------------------- */

      const qty = Number(item.quantity ?? 0);
      const price = Number(item.price ?? 0);

      const invoicedQuantity = doc.createElementNS(this.xmlns_cbc, 'cbc:InvoicedQuantity');
      invoicedQuantity.setAttribute('unitCode', item.unitOfMeasure);
      invoicedQuantity.textContent = qty.toFixed(2);
      invoiceLine.appendChild(invoicedQuantity);

      /* ---------------------------
       Price WITHOUT VAT
    --------------------------- */

      let priceWithoutVat = price;

      if (Zatca.IsTaxIncludedInPrice) {
        priceWithoutVat = price / 1.15;
      }

      /* ---------------------------
       Line calculations
    --------------------------- */

      const lineNet = qty * priceWithoutVat;
      const vat = lineNet * 0.15;
      const lineGross = lineNet + vat;

      /* ---------------------------
       LineExtensionAmount (BT-131)
       must equal qty * priceWithoutVAT
    --------------------------- */

      const lineExtensionAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:LineExtensionAmount');
      lineExtensionAmount.setAttribute('currencyID', 'SAR');
      lineExtensionAmount.textContent = lineNet.toFixed(2);
      invoiceLine.appendChild(lineExtensionAmount);

      /* ---------------------------
       TaxTotal
    --------------------------- */

      const taxTotal = doc.createElementNS(this.xmlns_cac, 'cac:TaxTotal');

      const taxAmountTag = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxAmount');
      taxAmountTag.setAttribute('currencyID', 'SAR');
      taxAmountTag.textContent = vat.toFixed(2);
      taxTotal.appendChild(taxAmountTag);

      const roundingAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:RoundingAmount');
      roundingAmount.setAttribute('currencyID', 'SAR');
      roundingAmount.textContent = lineGross.toFixed(2);
      taxTotal.appendChild(roundingAmount);

      invoiceLine.appendChild(taxTotal);

      /* ---------------------------
       Item
    --------------------------- */

      const invItem = doc.createElementNS(this.xmlns_cac, 'cac:Item');

      const name = doc.createElementNS(this.xmlns_cbc, 'cbc:Name');
      name.textContent = item.name;
      invItem.appendChild(name);

      const classifiedTaxCategory = doc.createElementNS(
        this.xmlns_cac,
        'cac:ClassifiedTaxCategory',
      );

      const taxId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
      taxId.textContent = 'S';
      classifiedTaxCategory.appendChild(taxId);

      const percent = doc.createElementNS(this.xmlns_cbc, 'cbc:Percent');
      percent.textContent = '15.00';
      classifiedTaxCategory.appendChild(percent);

      const taxScheme = doc.createElementNS(this.xmlns_cac, 'cac:TaxScheme');

      const taxSchemeId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
      taxSchemeId.textContent = 'VAT';

      taxScheme.appendChild(taxSchemeId);
      classifiedTaxCategory.appendChild(taxScheme);

      invItem.appendChild(classifiedTaxCategory);
      invoiceLine.appendChild(invItem);

      /* ---------------------------
       Price block (VAT exclusive)
    --------------------------- */

      const priceNode = doc.createElementNS(this.xmlns_cac, 'cac:Price');

      const priceAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:PriceAmount');
      priceAmount.setAttribute('currencyID', 'SAR');
      priceAmount.textContent = priceWithoutVat.toFixed(2);

      priceNode.appendChild(priceAmount);
      invoiceLine.appendChild(priceNode);

      root.appendChild(invoiceLine);
    }
  }
  private static _canonicalize(doc: Document): string {
    try {
      doc.normalize();

      const serializer = new XMLSerializer();
      let xml = serializer.serializeToString(doc);

      // Match .NET behavior
      xml = xml.replace(/\r/g, '').replace(/&#xD;/g, '').replace(/ \/>/g, '/>');

      return xml;
    } catch (ex: any) {
      throw new Error('Error occurred during XML canonicalization: ' + ex.message);
    }
  }
  static CanonicalizeXmlFromDoc(xmlDoc: Document): string {
    return this._canonicalize(xmlDoc);
  }
  static CanonicalizeXml(xml: string): string {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    return this._canonicalize(doc);
  }

  static async GetInvoiceHash(canonicalXml: string) {
    const bytes = Buffer.from(canonicalXml, 'utf8');

    const hashHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      bytes.toString('binary'),
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    const hashBytes = Buffer.from(hashHex, 'hex');

    return {
      hex: hashHex,
      base64: hashBytes.toString('base64'),
    };
  }

  static async GenerateSignedPropertiesHash(
    signingTime: string,
    issuerName: string,
    serialNumber: string,
    encodedCertificateHash: string,
  ): Promise<string> {
    const xmlTemplate = `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">
<xades:SignedSignatureProperties>
<xades:SigningTime>${signingTime}</xades:SigningTime>
<xades:SigningCertificate>
<xades:Cert>
<xades:CertDigest>
<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${encodedCertificateHash}</ds:DigestValue>
</xades:CertDigest>
<xades:IssuerSerial>
<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>
<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serialNumber}</ds:X509SerialNumber>
</xades:IssuerSerial>
</xades:Cert>
</xades:SigningCertificate>
</xades:SignedSignatureProperties>
</xades:SignedProperties>`;

    const bytes = Buffer.from(xmlTemplate, 'utf8');

    const hashHex = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      bytes.toString('binary'),
      { encoding: Crypto.CryptoEncoding.HEX },
    );

    const hexBytes = Buffer.from(hashHex, 'utf8');

    return hexBytes.toString('base64');
  }
  static async CreateUBLExtension(
    invoiceNo: string,
    doc: Document,
    root: Element,
    dateTime: Date,
    invoiceHash: string,
    signInfoHash: string,
    signatureBase64: string,
  ) {
    const extensions = doc.createElementNS(this.xmlns_ext, 'ext:UBLExtensions');

    const extension = doc.createElementNS(this.xmlns_ext, 'ext:UBLExtension');
    extensions.appendChild(extension);

    const extensionURI = doc.createElementNS(this.xmlns_ext, 'ext:ExtensionURI');
    extensionURI.textContent = 'urn:oasis:names:specification:ubl:dsig:enveloped:xades';
    extension.appendChild(extensionURI);

    const extensionContent = doc.createElementNS(this.xmlns_ext, 'ext:ExtensionContent');
    extension.appendChild(extensionContent);

    const uBLDocumentSignatures = doc.createElementNS(this.xmlns_sig, 'sig:UBLDocumentSignatures');

    uBLDocumentSignatures.setAttribute('xmlns:sig', this.xmlns_sig);
    uBLDocumentSignatures.setAttribute('xmlns:sac', this.xmlns_sac);
    uBLDocumentSignatures.setAttribute('xmlns:sbc', this.xmlns_sbc);

    extensionContent.appendChild(uBLDocumentSignatures);

    const signatureInformation = doc.createElementNS(this.xmlns_sac, 'sac:SignatureInformation');

    uBLDocumentSignatures.appendChild(signatureInformation);

    const signatureInformationID = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');

    signatureInformationID.textContent = 'urn:oasis:names:specification:ubl:signature:1';

    signatureInformation.appendChild(signatureInformationID);

    const referencedSignatureID = doc.createElementNS(this.xmlns_sbc, 'sbc:ReferencedSignatureID');

    referencedSignatureID.textContent = 'urn:oasis:names:specification:ubl:signature:Invoice';

    signatureInformation.appendChild(referencedSignatureID);

    const signature = doc.createElementNS(this.xmlns_ds, 'ds:Signature');
    // signature.setAttribute('xmlns:ds', this.xmlns_ds);
    signature.setAttribute('Id', 'signature');

    signatureInformation.appendChild(signature);

    const signedInfo = doc.createElementNS(this.xmlns_ds, 'ds:SignedInfo');
    signature.appendChild(signedInfo);

    const canonicalizationMethod = doc.createElementNS(this.xmlns_ds, 'ds:CanonicalizationMethod');

    canonicalizationMethod.setAttribute('Algorithm', 'http://www.w3.org/2006/12/xml-c14n11');

    signedInfo.appendChild(canonicalizationMethod);

    const signatureMethod = doc.createElementNS(this.xmlns_ds, 'ds:SignatureMethod');

    signatureMethod.setAttribute(
      'Algorithm',
      'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
    );

    signedInfo.appendChild(signatureMethod);

    const reference = doc.createElementNS(this.xmlns_ds, 'ds:Reference');

    reference.setAttribute('Id', 'invoiceSignedData');
    reference.setAttribute('URI', '');

    signedInfo.appendChild(reference);

    const transforms = doc.createElementNS(this.xmlns_ds, 'ds:Transforms');

    reference.appendChild(transforms);

    this.AddTransform(
      doc,
      transforms,
      'http://www.w3.org/TR/1999/REC-xpath-19991116',
      'not(//ancestor-or-self::ext:UBLExtensions)',
    );

    this.AddTransform(
      doc,
      transforms,
      'http://www.w3.org/TR/1999/REC-xpath-19991116',
      'not(//ancestor-or-self::cac:Signature)',
    );

    this.AddTransform(
      doc,
      transforms,
      'http://www.w3.org/TR/1999/REC-xpath-19991116',
      "not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])",
    );

    this.AddTransform(doc, transforms, 'http://www.w3.org/2006/12/xml-c14n11', null);

    const digestMethod = doc.createElementNS(this.xmlns_ds, 'ds:DigestMethod');

    digestMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');

    reference.appendChild(digestMethod);

    const digestValue = doc.createElementNS(this.xmlns_ds, 'ds:DigestValue');

    digestValue.textContent = invoiceHash;

    reference.appendChild(digestValue);

    const reference2 = doc.createElementNS(this.xmlns_ds, 'ds:Reference');

    reference2.setAttribute('URI', '#xadesSignedProperties');
    reference2.setAttribute('Type', 'http://www.w3.org/2000/09/xmldsig#SignatureProperties');

    signedInfo.appendChild(reference2);

    const digestMethodR2 = doc.createElementNS(this.xmlns_ds, 'ds:DigestMethod');

    digestMethodR2.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');

    reference2.appendChild(digestMethodR2);

    const digestValueR2 = doc.createElementNS(this.xmlns_ds, 'ds:DigestValue');

    digestValueR2.textContent = signInfoHash;

    reference2.appendChild(digestValueR2);

    const signatureValue = doc.createElementNS(this.xmlns_ds, 'ds:SignatureValue');

    signatureValue.textContent = signatureBase64;

    signature.appendChild(signatureValue);

    const keyInfo = doc.createElementNS(this.xmlns_ds, 'ds:KeyInfo');

    signature.appendChild(keyInfo);

    const x509Data = doc.createElementNS(this.xmlns_ds, 'ds:X509Data');

    keyInfo.appendChild(x509Data);

    const certRaw = await CertificateUtils.getCertificateRaw();
    const certBase64 = Buffer.from(certRaw).toString('base64');

    const x509Certificate = doc.createElementNS(this.xmlns_ds, 'ds:X509Certificate');
    x509Certificate.textContent = certBase64;

    x509Data.appendChild(x509Certificate);

    if (root.firstChild) {
      root.insertBefore(extensions, root.firstChild);
    } else {
      root.appendChild(extensions);
    }
  }
  static AddTransform(doc: Document, transforms: Element, algorithm: string, value: string | null) {
    const transform = doc.createElementNS(this.xmlns_ds, 'ds:Transform');
    transform.setAttribute('Algorithm', algorithm);

    if (value !== null) {
      const path = doc.createElementNS(this.xmlns_ds, 'ds:XPath');
      path.textContent = value;
      transform.appendChild(path);
    }

    transforms.appendChild(transform);
  }

  static async WriteSignatureToFile(invoiceNo: string, dateTime: Date): Promise<void> {
    const certificateDigestValue = await CertificateUtils.getDigestValue();
    const issuer = await CertificateUtils.getCertificateIssuer();
    const serial = await CertificateUtils.getSerialNumber();

    const signingTime = dateTime.toISOString().slice(0, 19);

    const signatureText = `
<ds:Object>
<xades:QualifyingProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Target="signature">
<xades:SignedProperties Id="xadesSignedProperties">
<xades:SignedSignatureProperties>
<xades:SigningTime>${signingTime}</xades:SigningTime>
<xades:SigningCertificate>
<xades:Cert>
<xades:CertDigest>
<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
<ds:DigestValue>${certificateDigestValue}</ds:DigestValue>
</xades:CertDigest>
<xades:IssuerSerial>
<ds:X509IssuerName>${issuer}</ds:X509IssuerName>
<ds:X509SerialNumber>${serial}</ds:X509SerialNumber>
</xades:IssuerSerial>
</xades:Cert>
</xades:SigningCertificate>
</xades:SignedSignatureProperties>
</xades:SignedProperties>
</xades:QualifyingProperties>
</ds:Object>`;

    const dir = new Directory(Paths.document, 'invoices', invoiceNo);
    const file = new File(dir, `${invoiceNo}.xml`);

    if (!file.exists) {
      throw new Error(`Invoice XML file not found: ${file.uri}`);
    }

    let content = await file.text();

    const insertIndex = content.indexOf('</ds:KeyInfo>') + '</ds:KeyInfo>'.length;

    if (insertIndex >= '</ds:KeyInfo>'.length) {
      content = content.slice(0, insertIndex) + signatureText + content.slice(insertIndex);
    }

    await file.write(content);

    const lines = content.split('\n');

    if (lines.length > 26) lines[26] = '                                  ' + lines[26];
    if (lines.length > 27) lines[27] = '                                  ' + lines[27];
    if (lines.length > 30) lines[30] = '                                  ' + lines[30];
    if (lines.length > 31) lines[31] = '                                  ' + lines[31];

    await file.write(lines.join('\n'));
  }

  static async ComputeHash(canonicalXml: string, hashAlgorithm: string): Promise<Uint8Array> {
    if (hashAlgorithm !== 'SHA256') {
      throw new Error(`Hash algorithm '${hashAlgorithm}' is not supported.`);
    }

    const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalXml, {
      encoding: Crypto.CryptoEncoding.HEX,
    });

    return Uint8Array.from(Buffer.from(hex, 'hex'));
  }
  static async UpdateXML(filePath: string, QRData: string): Promise<void> {
    const file = new File(filePath);

    let xmlContent = await file.text();

    const parser = new DOMParser({
      errorHandler: {
        warning: () => {},
        error: (msg) => console.warn(msg),
        fatalError: (msg) => console.error(msg),
      },
    });

    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

    const select = xpath.useNamespaces({
      cac: this.xmlns_cac,
      cbc: this.xmlns_cbc,
    });

    const qrNode = select(
      "//cac:AdditionalDocumentReference[cbc:ID='QR']/cac:Attachment/cbc:EmbeddedDocumentBinaryObject",
      xmlDoc,
    ) as Node[];

    if (qrNode.length > 0) {
      qrNode[0].textContent = QRData;

      const serializer = new XMLSerializer();

      xmlContent = serializer.serializeToString(xmlDoc);

      xmlContent = xmlContent.replace(/ \/>/g, '/>');

      await file.write(xmlContent);

      const cannXml = parser.parseFromString(xmlContent, 'text/xml');

      const canonicalXml = this.CanonicalizeXml2(cannXml);

      const hashValue = await this.ComputeHash(canonicalXml, this.hashAlgorithm);

      const hashBase64 = Buffer.from(hashValue).toString('base64');

      // store PIH (replace .NET settings)
      await savePreviousInvoiceHash(hashBase64);
    } else {
      console.warn('QR node not found.');
    }
  }
  static CanonicalizeXml2(xmlDocument: Document): string {
    return this._canonicalize(xmlDocument);
  }

  static calculateInvoiceTotals(items: InvoiceItem[]) {
    let net = 0;
    let vat = 0;

    for (const item of items) {
      const qty = Number(item.quantity ?? 0);
      const price = Number(item.price ?? 0);

      let priceWithoutVat = price;

      if (Zatca.IsTaxIncludedInPrice) {
        priceWithoutVat = price / 1.15;
      }

      const lineNet = qty * priceWithoutVat;
      const lineVat = lineNet * 0.15;

      net += lineNet;
      vat += lineVat;
    }

    return {
      net: Number(net.toFixed(2)),
      vat: Number(vat.toFixed(2)),
      gross: Number((net + vat).toFixed(2)),
    };
  }
}
