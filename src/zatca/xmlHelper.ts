import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import * as Sharing from 'expo-sharing';

export class XMLHelper {
  static buildInvoiceXML(data: any) {
    const xml = `
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">

<cbc:ID>${data.invoiceNumber}</cbc:ID>

<cbc:IssueDate>${data.invoiceDate}</cbc:IssueDate>

<cac:AccountingSupplierParty>
<cac:Party>

<cbc:Name>${data.sellerName}</cbc:Name>

</cac:Party>
</cac:AccountingSupplierParty>

<cac:LegalMonetaryTotal>

<cbc:TaxExclusiveAmount>${data.totalExclVAT}</cbc:TaxExclusiveAmount>

<cbc:TaxInclusiveAmount>${data.totalInclVAT}</cbc:TaxInclusiveAmount>

</cac:LegalMonetaryTotal>

</Invoice>
`;

    const doc = new DOMParser().parseFromString(xml, 'text/xml');

    return new XMLSerializer().serializeToString(doc);
  }
}

export async function shareInvoiceXML(uri: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri);
  }
}
