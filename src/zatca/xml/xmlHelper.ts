import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import * as Sharing from 'expo-sharing';
import { InvoiceXMLInput } from '../types';

export class XMLHelper {
  static buildInvoiceXML(data: InvoiceXMLInput) {
    const issueTime = data.invoiceTime ?? new Date().toISOString().split('T')[1].split('.')[0];

    const uuid = data.uuid ?? crypto.randomUUID();

    const doc = new DOMParser().parseFromString(
      `<Invoice
        xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
        xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
        xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
        xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
      />`,
      'text/xml',
    );

    const root = doc.documentElement;

    const append = (parent: Element, tag: string, text?: string) => {
      const el = doc.createElement(tag);
      if (text !== undefined) el.textContent = text;
      parent.appendChild(el);
      return el;
    };

    /*
    ------------------------------------------------
    UBL Extensions (signature injected later)
    ------------------------------------------------
    */

    const ext = append(root, 'ext:UBLExtensions');
    const extChild = append(ext, 'ext:UBLExtension');
    const extContent = append(extChild, 'ext:ExtensionContent');

    extContent.appendChild(doc.createTextNode('SIGNATURE_PLACEHOLDER'));

    /*
    ------------------------------------------------
    Basic Metadata
    ------------------------------------------------
    */

    append(root, 'cbc:ProfileID', 'reporting:1.0');

    append(root, 'cbc:ID', data.invoiceNumber);

    append(root, 'cbc:UUID', uuid);

    append(root, 'cbc:IssueDate', data.invoiceDate);

    append(root, 'cbc:IssueTime', issueTime);

    const type = append(root, 'cbc:InvoiceTypeCode', '388');
    type.setAttribute('name', '0200000');

    append(root, 'cbc:DocumentCurrencyCode', 'SAR');

    append(root, 'cbc:TaxCurrencyCode', 'SAR');

    /*
    ------------------------------------------------
    UBL Signature metadata (required by ZATCA)
    ------------------------------------------------
    */

    const signature = append(root, 'cac:Signature');

    append(signature, 'cbc:ID', 'urn:oasis:names:specification:ubl:signature:Invoice');

    append(
      signature,
      'cbc:SignatureMethod',
      'urn:oasis:names:specification:ubl:dsig:enveloped:xades',
    );

    /*
    ------------------------------------------------
    Invoice Counter (ICV)
    ------------------------------------------------
    */

    if (data.invoiceCounter) {
      const icv = append(root, 'cac:AdditionalDocumentReference');

      append(icv, 'cbc:ID', 'ICV');

      append(icv, 'cbc:UUID', data.invoiceCounter);
    }

    /*
    ------------------------------------------------
    Previous Invoice Hash (PIH)
    ------------------------------------------------
    */

    if (data.previousInvoiceHash) {
      const pih = append(root, 'cac:AdditionalDocumentReference');

      append(pih, 'cbc:ID', 'PIH');

      const attachment = append(pih, 'cac:Attachment');

      const embedded = append(
        attachment,
        'cbc:EmbeddedDocumentBinaryObject',
        data.previousInvoiceHash,
      );

      embedded.setAttribute('mimeCode', 'text/plain');
    }

    /*
    ------------------------------------------------
    Supplier
    ------------------------------------------------
    */

    const supplier = append(root, 'cac:AccountingSupplierParty');

    const party = append(supplier, 'cac:Party');

    /*
    Seller Identification
    */

    const identification = append(party, 'cac:PartyIdentification');

    const id = append(identification, 'cbc:ID', data.sellerVat);

    id.setAttribute('schemeID', 'CRN');

    /*
    VAT registration
    */

    const taxScheme = append(party, 'cac:PartyTaxScheme');

    append(taxScheme, 'cbc:CompanyID', data.sellerVat);

    const scheme = append(taxScheme, 'cac:TaxScheme');

    append(scheme, 'cbc:ID', 'VAT');

    /*
    Legal entity
    */

    const legal = append(party, 'cac:PartyLegalEntity');

    append(legal, 'cbc:RegistrationName', data.sellerName);

    /*
    ------------------------------------------------
    Delivery
    ------------------------------------------------
    */

    const delivery = append(root, 'cac:Delivery');

    append(delivery, 'cbc:ActualDeliveryDate', data.invoiceDate);

    /*
    ------------------------------------------------
    Payment
    ------------------------------------------------
    */

    const payment = append(root, 'cac:PaymentMeans');

    append(payment, 'cbc:PaymentMeansCode', '30');

    /*
    ------------------------------------------------
    TaxTotal
    ------------------------------------------------
    */

    const taxTotal = append(root, 'cac:TaxTotal');

    const taxAmount = append(taxTotal, 'cbc:TaxAmount', data.totalVAT);

    taxAmount.setAttribute('currencyID', 'SAR');

    const subtotal = append(taxTotal, 'cac:TaxSubtotal');

    const taxable = append(subtotal, 'cbc:TaxableAmount', data.totalExclVAT);

    taxable.setAttribute('currencyID', 'SAR');

    const subTax = append(subtotal, 'cbc:TaxAmount', data.totalVAT);

    subTax.setAttribute('currencyID', 'SAR');

    const category = append(subtotal, 'cac:TaxCategory');

    append(category, 'cbc:ID', 'S');

    append(category, 'cbc:Percent', '15');

    const scheme2 = append(category, 'cac:TaxScheme');

    append(scheme2, 'cbc:ID', 'VAT');

    /*
    ------------------------------------------------
    Legal Monetary Total
    ------------------------------------------------
    */

    const monetary = append(root, 'cac:LegalMonetaryTotal');

    const excl = append(monetary, 'cbc:TaxExclusiveAmount', data.totalExclVAT);

    excl.setAttribute('currencyID', 'SAR');

    const incl = append(monetary, 'cbc:TaxInclusiveAmount', data.totalInclVAT);

    incl.setAttribute('currencyID', 'SAR');

    const payable = append(monetary, 'cbc:PayableAmount', data.totalInclVAT);

    payable.setAttribute('currencyID', 'SAR');

    /*
    ------------------------------------------------
    Invoice Lines
    ------------------------------------------------
    */

    if (data.items && data.items.length) {
      this.createInvoiceLines(doc, root, data.items);
    }

    /*
    ------------------------------------------------
    QR Placeholder
    ------------------------------------------------
    */

    const qr = append(root, 'cac:AdditionalDocumentReference');

    append(qr, 'cbc:ID', 'QR');

    const attach = append(qr, 'cac:Attachment');

    const qrValue = append(attach, 'cbc:EmbeddedDocumentBinaryObject', 'QR_PLACEHOLDER');

    qrValue.setAttribute('mimeCode', 'text/plain');

    return new XMLSerializer().serializeToString(doc);
  }

  /*
  ------------------------------------------------
  Inject QR
  ------------------------------------------------
  */

  static injectQR(xml: string, qrBase64: string) {
    return xml.replace('QR_PLACEHOLDER', qrBase64);
  }

  /*
  ------------------------------------------------
  Remove nodes before hashing
  ------------------------------------------------
  */

  static removeTagsForHash(xml: string) {
    const doc = new DOMParser().parseFromString(xml);

    const removeNodes = (tag: string) => {
      const nodes = doc.getElementsByTagName(tag);

      for (let i = nodes.length - 1; i >= 0; i--) {
        nodes[i].parentNode?.removeChild(nodes[i]);
      }
    };

    removeNodes('ext:UBLExtensions');

    removeNodes('cac:Signature');

    const refs = doc.getElementsByTagName('cac:AdditionalDocumentReference');

    for (let i = refs.length - 1; i >= 0; i--) {
      const id = refs[i].getElementsByTagName('cbc:ID')[0]?.textContent;

      if (id === 'QR') {
        refs[i].parentNode?.removeChild(refs[i]);
      }
    }

    return new XMLSerializer().serializeToString(doc);
  }

  /*
  ------------------------------------------------
  Invoice Lines
  ------------------------------------------------
  */

  private static createInvoiceLines(doc: Document, root: Element, items: any[]) {
    const append = (parent: Element, tag: string, text?: string) => {
      const el = doc.createElement(tag);
      if (text !== undefined) el.textContent = text;
      parent.appendChild(el);
      return el;
    };

    items.forEach((item, index) => {
      const vatRate = item.vatRate ?? 15;

      const vatDecimal = vatRate / 100;

      const lineTotal = item.quantity * item.price;

      const vatAmount = lineTotal * vatDecimal;

      const invoiceLine = append(root, 'cac:InvoiceLine');

      append(invoiceLine, 'cbc:ID', String(index + 1));

      const quantity = append(invoiceLine, 'cbc:InvoicedQuantity', item.quantity.toFixed(2));

      quantity.setAttribute('unitCode', item.unitCode ?? 'PCE');

      const extensionAmount = append(invoiceLine, 'cbc:LineExtensionAmount', lineTotal.toFixed(2));

      extensionAmount.setAttribute('currencyID', 'SAR');

      const taxTotal = append(invoiceLine, 'cac:TaxTotal');

      const taxAmount = append(taxTotal, 'cbc:TaxAmount', vatAmount.toFixed(2));

      taxAmount.setAttribute('currencyID', 'SAR');

      const rounding = append(taxTotal, 'cbc:RoundingAmount', (lineTotal + vatAmount).toFixed(2));

      rounding.setAttribute('currencyID', 'SAR');

      const itemNode = append(invoiceLine, 'cac:Item');

      append(itemNode, 'cbc:Name', item.name);

      const taxCategory = append(itemNode, 'cac:ClassifiedTaxCategory');

      append(taxCategory, 'cbc:ID', 'S');

      append(taxCategory, 'cbc:Percent', vatRate.toString());

      const taxScheme = append(taxCategory, 'cac:TaxScheme');

      append(taxScheme, 'cbc:ID', 'VAT');

      const price = append(invoiceLine, 'cac:Price');

      const priceAmount = append(price, 'cbc:PriceAmount', item.price.toFixed(2));

      priceAmount.setAttribute('currencyID', 'SAR');
    });
  }
}

/*
------------------------------------------------
Share XML
------------------------------------------------
*/

export async function shareInvoiceXML(uri: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
}
