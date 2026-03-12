import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export interface SignatureInjectionInput {
  invoiceHash: string;
  signedPropertiesHash: string;
  signatureValue: string;
  certificateBase64: string;
}

export function injectXMLSignature(xml: string, input: SignatureInjectionInput): string {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');

  const invoice = doc.documentElement;

  const extNs = 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2';
  const sigNs = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2';
  const sacNs = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2';
  const sbcNs = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2';
  const dsNs = 'http://www.w3.org/2000/09/xmldsig#';

  const ublExtensions = doc.createElementNS(extNs, 'ext:UBLExtensions');
  const ublExtension = doc.createElementNS(extNs, 'ext:UBLExtension');
  const extensionContent = doc.createElementNS(extNs, 'ext:ExtensionContent');

  const documentSignatures = doc.createElementNS(sigNs, 'sig:UBLDocumentSignatures');

  const signatureInformation = doc.createElementNS(sacNs, 'sac:SignatureInformation');

  const signatureInformationID = doc.createElement('cbc:ID');
  signatureInformationID.textContent = 'urn:oasis:names:specification:ubl:signature:1';

  const referencedSignatureID = doc.createElementNS(sbcNs, 'sbc:ReferencedSignatureID');
  referencedSignatureID.textContent = 'urn:oasis:names:specification:ubl:signature:Invoice';

  signatureInformation.appendChild(signatureInformationID);
  signatureInformation.appendChild(referencedSignatureID);

  const signature = doc.createElementNS(dsNs, 'ds:Signature');
  signature.setAttribute('Id', 'signature');

  const signedInfo = doc.createElementNS(dsNs, 'ds:SignedInfo');

  const canonicalizationMethod = doc.createElementNS(dsNs, 'ds:CanonicalizationMethod');
  canonicalizationMethod.setAttribute('Algorithm', 'http://www.w3.org/2006/12/xml-c14n11');

  const signatureMethod = doc.createElementNS(dsNs, 'ds:SignatureMethod');
  signatureMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256');

  signedInfo.appendChild(canonicalizationMethod);
  signedInfo.appendChild(signatureMethod);

  /*
  -------------------------
  Reference (Invoice hash)
  -------------------------
  */

  const reference = doc.createElementNS(dsNs, 'ds:Reference');
  reference.setAttribute('Id', 'invoiceSignedData');
  reference.setAttribute('URI', '');

  const transforms = doc.createElementNS(dsNs, 'ds:Transforms');

  const transform1 = doc.createElementNS(dsNs, 'ds:Transform');
  transform1.setAttribute('Algorithm', 'http://www.w3.org/TR/1999/REC-xpath-19991116');

  const xpath1 = doc.createElementNS(dsNs, 'ds:XPath');
  xpath1.textContent = 'not(//ancestor-or-self::ext:UBLExtensions)';

  transform1.appendChild(xpath1);

  const transform2 = doc.createElementNS(dsNs, 'ds:Transform');
  transform2.setAttribute('Algorithm', 'http://www.w3.org/TR/1999/REC-xpath-19991116');

  const xpath2 = doc.createElementNS(dsNs, 'ds:XPath');
  xpath2.textContent = 'not(//ancestor-or-self::cac:Signature)';

  transform2.appendChild(xpath2);

  const transform3 = doc.createElementNS(dsNs, 'ds:Transform');
  transform3.setAttribute('Algorithm', 'http://www.w3.org/TR/1999/REC-xpath-19991116');

  const xpath3 = doc.createElementNS(dsNs, 'ds:XPath');
  xpath3.textContent = "not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])";

  transform3.appendChild(xpath3);

  const transform4 = doc.createElementNS(dsNs, 'ds:Transform');
  transform4.setAttribute('Algorithm', 'http://www.w3.org/2006/12/xml-c14n11');

  transforms.appendChild(transform1);
  transforms.appendChild(transform2);
  transforms.appendChild(transform3);
  transforms.appendChild(transform4);

  reference.appendChild(transforms);

  const digestMethod = doc.createElementNS(dsNs, 'ds:DigestMethod');
  digestMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');

  const digestValue = doc.createElementNS(dsNs, 'ds:DigestValue');
  digestValue.textContent = input.invoiceHash;

  reference.appendChild(digestMethod);
  reference.appendChild(digestValue);

  signedInfo.appendChild(reference);

  /*
  SignedProperties Reference
  */

  const reference2 = doc.createElementNS(dsNs, 'ds:Reference');
  reference2.setAttribute('URI', '#xadesSignedProperties');
  reference2.setAttribute('Type', 'http://www.w3.org/2000/09/xmldsig#SignatureProperties');

  const digestMethod2 = doc.createElementNS(dsNs, 'ds:DigestMethod');
  digestMethod2.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');

  const digestValue2 = doc.createElementNS(dsNs, 'ds:DigestValue');
  digestValue2.textContent = input.signedPropertiesHash;

  reference2.appendChild(digestMethod2);
  reference2.appendChild(digestValue2);

  signedInfo.appendChild(reference2);

  signature.appendChild(signedInfo);

  const signatureValue = doc.createElementNS(dsNs, 'ds:SignatureValue');
  signatureValue.textContent = input.signatureValue;

  signature.appendChild(signatureValue);

  const keyInfo = doc.createElementNS(dsNs, 'ds:KeyInfo');

  const x509Data = doc.createElementNS(dsNs, 'ds:X509Data');

  const certificate = doc.createElementNS(dsNs, 'ds:X509Certificate');
  certificate.textContent = input.certificateBase64;

  x509Data.appendChild(certificate);
  keyInfo.appendChild(x509Data);

  signature.appendChild(keyInfo);

  signatureInformation.appendChild(signature);

  documentSignatures.appendChild(signatureInformation);

  extensionContent.appendChild(documentSignatures);

  ublExtension.appendChild(extensionContent);

  ublExtensions.appendChild(ublExtension);

  if (invoice.firstChild) {
    invoice.insertBefore(ublExtensions, invoice.firstChild);
  } else {
    invoice.appendChild(ublExtensions);
  }

  return new XMLSerializer().serializeToString(doc);
}
