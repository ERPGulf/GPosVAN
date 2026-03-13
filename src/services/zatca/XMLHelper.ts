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
      console.log('[ZATCA] Starting createInvoice', invoiceUUID);

      const taxTotalAmount = tax;

      const doc = new DOMParser().parseFromString('<root/>', 'text/xml');

      const uuid = randomUUID();

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

      console.log('[ZATCA] Root XML created');

      totalExcludeTax = cartItems.reduce((sum, item) => {
        const price = Number(item.price ?? item.price ?? 0);
        const quantity = Number(item.quantity ?? item.quantity ?? 0);

        return sum + price * quantity;
      }, 0);

      console.log('[ZATCA] Calculated totals', totalExcludeTax);

      this.CreateBaseXMLTags(doc, root, invoiceNumber, invoiceDate, uuid);
      this.CreateAdditionalReferenceXMLTags(doc, root, invoiceNumber, previousInvoiceHash);

      this.AddAccountingSupplierParty(doc, root);
      this.AddAccountingCustomerParty(doc, root, customer);

      this.CreateDeliveryAndPaymentTags(doc, root, invoiceDate);

      this.CreateAllowanceTags(doc, root, taxTotalAmount, discount);

      this.CreateTaxTotalWithSubTotal(doc, root, taxTotalAmount, totalExcludeTax);

      this.CreateLegalMonetaryTotalTags(doc, root, taxTotalAmount, totalExcludeTax, discount);

      this.CreateItemsTag(doc, root, cartItems);

      console.log('[ZATCA] XML body constructed');

      const dir = new Directory(Paths.document, 'invoices', invoiceUUID);

      if (!dir.exists) {
        console.log('[ZATCA] Creating invoice directory:', dir.uri);
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

      console.log('[ZATCA] Temp XML written:', tempFile.uri);

      const currentXml = serializer.serializeToString(doc);

      const canonicalXml = await this.CanonicalizeXml(currentXml);

      const invoiceHash = await this.GetInvoiceHash(canonicalXml);

      console.log('[ZATCA] Invoice hash generated:', invoiceHash.base64);

      const certificateDigestValue = await CertificateUtils.getDigestValue();
      const issuerName = await CertificateUtils.getCertificateIssuer();
      const serialNumber = await CertificateUtils.getSerialNumber();
      console.log('CertDigest:', certificateDigestValue);
      console.log('Issuer:', issuerName);
      console.log('Serial:', serialNumber);
      if (!certificateDigestValue || !issuerName || !serialNumber) {
        throw new Error('Certificate information is missing');
      }

      const certificateSignInHash = await this.GenerateSignedPropertiesHash(
        invoiceDate.toISOString().slice(0, 19),
        issuerName,
        serialNumber,
        certificateDigestValue,
      );

      const invoiceSignature = await CertificateUtils.SignHashWithECDSABytes(invoiceHash.hex);

      console.log('[ZATCA] Invoice signed');

      this.CreateUBLExtension(
        invoiceUUID,
        doc,
        root,
        invoiceDate,
        invoiceHash.base64, // ds:DigestValue
        certificateSignInHash, // SignedProperties digest
        Buffer.from(invoiceSignature).toString('base64'), // ds:SignatureValue
      );

      this.AddQRTag(doc, root);

      const finalFile = new File(dir, `${invoiceUUID}.xml`);

      await finalFile.write(serializer.serializeToString(doc));

      console.log('[ZATCA] Final XML written:', finalFile.uri);

      await this.WriteSignatureToFile(invoiceUUID, invoiceDate);
      // test
      //   const canonicalXml = await this.CanonicalizeXml(xmlText);

      //   const hashValue = await this.ComputeHash(canonicalXml, this.hashAlgorithm);

      //   const hashBase64 = Buffer.from(hashValue).toString('base64');
      const hashBase64 = invoiceHash.base64;

      console.log('InvoiceHash:', invoiceHash.base64);
      console.log('Signature:', Buffer.from(invoiceSignature).toString('base64'));
      console.log('SignedPropertiesHash:', certificateSignInHash);

      const qrData = await QRUtils.GetQRString(
        invoiceHash.base64,
        invoiceDate.toISOString().slice(0, 19),
        totalExcludeTax + taxTotalAmount,
        taxTotalAmount,
        invoiceSignature,
      );

      console.log('[ZATCA] QR data generated');

      console.log('[ZATCA] UpdateXML path:', finalFile.uri);

      await this.UpdateXML(finalFile.uri, qrData);

      await QRUtils.saveQR(qrData, invoiceUUID);

      const finalXml = serializer.serializeToString(doc);

      console.log('[ZATCA] Invoice pipeline completed successfully');

      return {
        xml: finalXml,
        hash: hashBase64,
        signature: Buffer.from(invoiceSignature).toString('base64'),
        qrBase64: qrData,
        fileUri: finalFile.uri,
      };
    } catch (error: any) {
      console.error('❌ [ZATCA] Invoice generation failed');
      console.error('Message:', error?.message);
      console.error('Stack:', error?.stack);
      console.error('Full Error:', JSON.stringify(error, null, 2));

      throw error; // rethrow so checkout page can handle it
    }
  }

  static CreateBaseXMLTags(
    doc: Document,
    root: Element,
    invoiceNumber: string,
    invoiceDate: Date,
    uuidValue: string,
  ) {
    // Invoice/ProfileID
    const profileId = doc.createElementNS(this.xmlns_cbc, 'cbc:ProfileID');
    profileId.textContent = 'reporting:1.0';
    root.appendChild(profileId);

    // Invoice/ID
    const id = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    id.textContent = `ACC-SINV-${new Date().getFullYear()}-${invoiceNumber}`;
    root.appendChild(id);

    // Invoice/UUID
    const uuid = doc.createElementNS(this.xmlns_cbc, 'cbc:UUID');
    uuid.textContent = uuidValue;
    root.appendChild(uuid);

    // Invoice/IssueDate
    const issueDate = doc.createElementNS(this.xmlns_cbc, 'cbc:IssueDate');
    issueDate.textContent = invoiceDate.toISOString().slice(0, 10);
    root.appendChild(issueDate);

    // Invoice/IssueTime
    const issueTime = doc.createElementNS(this.xmlns_cbc, 'cbc:IssueTime');
    issueTime.textContent = invoiceDate.toTimeString().slice(0, 8);
    root.appendChild(issueTime);

    // Invoice/InvoiceTypeCode
    const invoiceTypeCode = doc.createElementNS(this.xmlns_cbc, 'cbc:InvoiceTypeCode');
    invoiceTypeCode.setAttribute('name', '0200000');
    invoiceTypeCode.textContent = '388';
    root.appendChild(invoiceTypeCode);

    // Invoice/DocumentCurrencyCode
    const documentCurrencyCode = doc.createElementNS(this.xmlns_cbc, 'cbc:DocumentCurrencyCode');
    documentCurrencyCode.textContent = 'SAR';
    root.appendChild(documentCurrencyCode);

    // Invoice/TaxCurrencyCode
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
      customer.Id,
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
    const allowanceCharge = doc.createElementNS(this.xmlns_cac, 'cac:AllowanceCharge');
    root.appendChild(allowanceCharge);

    const chargeIndicator = doc.createElementNS(this.xmlns_cbc, 'cbc:ChargeIndicator');
    chargeIndicator.textContent = 'false';
    allowanceCharge.appendChild(chargeIndicator);

    const allowanceChargeReasonCode = doc.createElementNS(
      this.xmlns_cbc,
      'cbc:AllowanceChargeReasonCode',
    );
    allowanceChargeReasonCode.textContent = '95';
    allowanceCharge.appendChild(allowanceChargeReasonCode);

    const allowanceChargeReason = doc.createElementNS(this.xmlns_cbc, 'cbc:AllowanceChargeReason');
    allowanceChargeReason.textContent = 'Loyalty Discount';
    allowanceCharge.appendChild(allowanceChargeReason);

    const amount = doc.createElementNS(this.xmlns_cbc, 'cbc:Amount');
    amount.setAttribute('currencyID', 'SAR');
    amount.textContent = discount.toFixed(2);
    allowanceCharge.appendChild(amount);

    const tax = doc.createElementNS(this.xmlns_cac, 'cac:TaxCategory');
    allowanceCharge.appendChild(tax);

    const taxId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');

    if (discount > 0) {
      taxId.textContent = 'Z';
    } else {
      taxId.textContent = 'S';
    }

    tax.appendChild(taxId);

    const percent = doc.createElementNS(this.xmlns_cbc, 'cbc:Percent');
    percent.textContent = '15.00';
    tax.appendChild(percent);

    const taxScheme = doc.createElementNS(this.xmlns_cac, 'cac:TaxScheme');
    tax.appendChild(taxScheme);

    const taxSchemeId = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    taxSchemeId.textContent = 'VAT';
    taxScheme.appendChild(taxSchemeId);

    const taxTotal = doc.createElementNS(this.xmlns_cac, 'cac:TaxTotal');
    root.appendChild(taxTotal);

    const taxAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxAmount');
    taxAmount.setAttribute('currencyID', 'SAR');
    taxAmount.textContent = totalTax.toFixed(2);

    taxTotal.appendChild(taxAmount);
  }
  static CreateTaxTotalWithSubTotal(
    doc: Document,
    root: Element,
    totalTax: number,
    invoiceNo: number,
  ) {
    const TaxTotal = doc.createElementNS(this.xmlns_cac, 'cac:TaxTotal');

    const TaxAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxAmount');
    TaxAmount.setAttribute('currencyID', 'SAR');
    TaxAmount.textContent = totalTax.toFixed(2);

    TaxTotal.appendChild(TaxAmount);

    const TaxSubtotal = doc.createElementNS(this.xmlns_cac, 'cac:TaxSubtotal');

    const TaxableAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxableAmount');
    TaxableAmount.setAttribute('currencyID', 'SAR');
    TaxableAmount.textContent = invoiceNo.toFixed(2);

    TaxSubtotal.appendChild(TaxableAmount);

    const TaxAmount1 = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxAmount');
    TaxAmount1.setAttribute('currencyID', 'SAR');
    TaxAmount1.textContent = totalTax.toFixed(2);

    TaxSubtotal.appendChild(TaxAmount1);

    const taxCategory = doc.createElementNS(this.xmlns_cac, 'cac:TaxCategory');

    const categeoryID = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    categeoryID.textContent = 'S';
    taxCategory.appendChild(categeoryID);

    const categeoryPercentage = doc.createElementNS(this.xmlns_cbc, 'cbc:Percent');
    categeoryPercentage.textContent = '15.00';
    taxCategory.appendChild(categeoryPercentage);

    // kept but not appended (same as C#)
    const taxExemptionReasonCode = doc.createElementNS(
      this.xmlns_cbc,
      'cbc:TaxExemptionReasonCode',
    );
    taxExemptionReasonCode.textContent = '95';

    const taxExemptionReason = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxExemptionReason');
    taxExemptionReason.textContent = 'Discount';

    const taxScheme = doc.createElementNS(this.xmlns_cac, 'cac:TaxScheme');

    const taxSchemeID = doc.createElementNS(this.xmlns_cbc, 'cbc:ID');
    taxSchemeID.textContent = 'VAT';

    taxScheme.appendChild(taxSchemeID);
    taxCategory.appendChild(taxScheme);

    // same order as original C#
    TaxSubtotal.appendChild(TaxAmount1);
    TaxSubtotal.appendChild(taxCategory);

    TaxTotal.appendChild(TaxAmount);
    TaxTotal.appendChild(TaxSubtotal);

    root.appendChild(TaxTotal);
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

      const invoicedQuantity = doc.createElementNS(this.xmlns_cbc, 'cbc:InvoicedQuantity');

      invoicedQuantity.setAttribute('unitCode', item.unitOfMeasure);
      invoicedQuantity.textContent = Number(item.quantity).toFixed(2);

      invoiceLine.appendChild(invoicedQuantity);

      let tax = 0;

      // TODO(ZATCA-MIGRATION): restore DiscountUtils.GetDiscountRate
      const itemPrice = item.price ?? 0;

      if (Zatca.IsTaxIncludedInPrice) {
        // TODO(ZATCA-MIGRATION): restore TaxUtility.CalculateTax
        tax = item.quantity * itemPrice * 0.15;
      } else {
        tax = item.quantity * itemPrice * 0.15;
      }

      const lineExtensionAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:LineExtensionAmount');

      lineExtensionAmount.setAttribute('currencyID', 'SAR');

      if (Zatca.IsTaxIncludedInPrice) {
        const amount = item.quantity * itemPrice;

        lineExtensionAmount.textContent = (amount - tax).toFixed(2);
      } else {
        lineExtensionAmount.textContent = (item.quantity * itemPrice).toFixed(2);
      }

      invoiceLine.appendChild(lineExtensionAmount);

      const taxTotal = doc.createElementNS(this.xmlns_cac, 'cac:TaxTotal');

      const taxAmountTag = doc.createElementNS(this.xmlns_cbc, 'cbc:TaxAmount');

      taxAmountTag.setAttribute('currencyID', 'SAR');

      if (Zatca.IsTaxIncludedInPrice) {
        taxAmountTag.textContent = tax.toFixed(2);
      } else {
        taxAmountTag.textContent = (item.quantity * itemPrice * 0.15).toFixed(2);
      }

      taxTotal.appendChild(taxAmountTag);

      const roundingAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:RoundingAmount');

      roundingAmount.setAttribute('currencyID', 'SAR');

      if (Zatca.IsTaxIncludedInPrice) {
        roundingAmount.textContent = (item.quantity * itemPrice).toFixed(2);
      } else {
        roundingAmount.textContent = (item.quantity * itemPrice + tax).toFixed(2);
      }

      taxTotal.appendChild(roundingAmount);

      invoiceLine.appendChild(taxTotal);

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

      const price = doc.createElementNS(this.xmlns_cac, 'cac:Price');

      const priceAmount = doc.createElementNS(this.xmlns_cbc, 'cbc:PriceAmount');

      priceAmount.setAttribute('currencyID', 'SAR');

      if (Zatca.IsTaxIncludedInPrice) {
        // TODO(ZATCA-MIGRATION): restore TaxUtility.CalculateTax
        priceAmount.textContent = itemPrice.toFixed(2);
      } else {
        priceAmount.textContent = itemPrice.toFixed(2);
      }

      price.appendChild(priceAmount);

      invoiceLine.appendChild(price);

      root.appendChild(invoiceLine);
    }
  }
  static CanonicalizeXmlFromDoc(xmlDoc: Document): string {
    try {
      const serializer = new XMLSerializer();

      let canonicalXml = serializer.serializeToString(xmlDoc);

      canonicalXml = canonicalXml.replace(/&#xD;/g, '');

      return canonicalXml;
    } catch (ex: any) {
      throw new Error('Error occurred during XML canonicalization: ' + ex.message);
    }
  }
  static CanonicalizeXml(xml: string): string {
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');

      const serializer = new XMLSerializer();

      let canonicalXml = serializer.serializeToString(doc);

      // match C# behaviour
      canonicalXml = canonicalXml.replace(/&#xD;/g, '');

      return canonicalXml;
    } catch (ex: any) {
      throw new Error('Error occurred during XML canonicalization: ' + ex.message);
    }
  }

  static async GetInvoiceHash(canonicalizedXml: string): Promise<{
    hex: string;
    base64: string;
  }> {
    try {
      const hashHex = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        canonicalizedXml,
        { encoding: Crypto.CryptoEncoding.HEX },
      );

      const hashBytes = Buffer.from(hashHex, 'hex');

      const hashBase64 = hashBytes.toString('base64');

      return {
        hex: hashHex,
        base64: hashBase64,
      };
    } catch (ex: any) {
      throw new Error('An error occurred while generating the invoice hash: ' + ex.message);
    }
  }

  static async GenerateSignedPropertiesHash(
    signingTime: string,
    issuerName: string,
    serialNumber: string,
    encodedCertificateHash: string,
  ): Promise<string> {
    try {
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

      const hashHex = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        xmlTemplate,
        { encoding: Crypto.CryptoEncoding.HEX },
      );

      const hexUtf8Bytes = Buffer.from(hashHex, 'utf8');

      const signedPropertiesBase64 = hexUtf8Bytes.toString('base64');

      return signedPropertiesBase64;
    } catch (ex: any) {
      throw new Error('Error in generating signed properties hash: ' + ex.message);
    }
  }
  static CreateUBLExtension(
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

    // uBLDocumentSignatures.setAttribute('xmlns:sig', this.xmlns_sig);
    // uBLDocumentSignatures.setAttribute('xmlns:sac', this.xmlns_sac);
    // uBLDocumentSignatures.setAttribute('xmlns:sbc', this.xmlns_sbc);

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

    const certBase64 = Zatca.Certificate;

    // const certValue = Buffer.from(certBase64, 'base64').toString('utf8');

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
    try {
      const serializer = new XMLSerializer();

      let canonicalXml = serializer.serializeToString(xmlDocument);

      // Match C# behavior removing carriage returns
      canonicalXml = canonicalXml.replace(/&#xD;/g, '');

      return canonicalXml;
    } catch (ex: any) {
      throw new Error('Error occurred in canonicalizing XML: ' + ex.message);
    }
  }
}
