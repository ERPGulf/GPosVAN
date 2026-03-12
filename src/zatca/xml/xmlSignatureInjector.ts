import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

export interface SignatureInjectionInput {
  invoiceHash: string;
  signedPropertiesHash: string;
  signatureValue: string;
  certificateBase64: string;
}

export function injectXMLSignature(xml: string, input: SignatureInjectionInput): string {
  const doc = new DOMParser().parseFromString('<root/>', 'text/xml');

  const sigNs = 'urn:oasis:names:specification:ubl:schema:xsd:CommonSignatureComponents-2';
  const sacNs = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureAggregateComponents-2';
  const sbcNs = 'urn:oasis:names:specification:ubl:schema:xsd:SignatureBasicComponents-2';
  const dsNs = 'http://www.w3.org/2000/09/xmldsig#';
  const cbcNs = 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2';
  const xadesNs = 'http://uri.etsi.org/01903/v1.3.2#';

  const create = (ns: string, tag: string) => doc.createElementNS(ns, tag);

  /*
  --------------------------------
  UBLDocumentSignatures
  --------------------------------
  */

  const documentSignatures = create(sigNs, 'sig:UBLDocumentSignatures');

  documentSignatures.setAttribute('xmlns:sac', sacNs);
  documentSignatures.setAttribute('xmlns:sbc', sbcNs);

  /*
  --------------------------------
  SignatureInformation
  --------------------------------
  */

  const signatureInformation = create(sacNs, 'sac:SignatureInformation');

  const signatureInformationID = create(cbcNs, 'cbc:ID');
  signatureInformationID.textContent = 'urn:oasis:names:specification:ubl:signature:1';

  const referencedSignatureID = create(sbcNs, 'sbc:ReferencedSignatureID');

  referencedSignatureID.textContent = 'urn:oasis:names:specification:ubl:signature:Invoice';

  signatureInformation.appendChild(signatureInformationID);
  signatureInformation.appendChild(referencedSignatureID);

  /*
  --------------------------------
  ds:Signature
  --------------------------------
  */

  const signature = create(dsNs, 'ds:Signature');
  signature.setAttribute('Id', 'signature');

  /*
  Namespace declarations for XPath
  */

  signature.setAttribute(
    'xmlns:ext',
    'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
  );

  signature.setAttribute(
    'xmlns:cac',
    'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  );

  signature.setAttribute(
    'xmlns:cbc',
    'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  );

  const signedInfo = create(dsNs, 'ds:SignedInfo');

  const canonicalizationMethod = create(dsNs, 'ds:CanonicalizationMethod');

  canonicalizationMethod.setAttribute('Algorithm', 'http://www.w3.org/2006/12/xml-c14n11');

  const signatureMethod = create(dsNs, 'ds:SignatureMethod');

  signatureMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256');

  signedInfo.appendChild(canonicalizationMethod);
  signedInfo.appendChild(signatureMethod);

  /*
  Invoice reference
  */

  const reference = create(dsNs, 'ds:Reference');
  reference.setAttribute('Id', 'invoiceSignedData');
  reference.setAttribute('URI', '');

  const transforms = create(dsNs, 'ds:Transforms');

  const transform = (xpath: string) => {
    const t = create(dsNs, 'ds:Transform');
    t.setAttribute('Algorithm', 'http://www.w3.org/TR/1999/REC-xpath-19991116');

    const xp = create(dsNs, 'ds:XPath');
    xp.textContent = xpath;

    t.appendChild(xp);

    return t;
  };

  transforms.appendChild(transform('not(//ancestor-or-self::ext:UBLExtensions)'));

  transforms.appendChild(transform('not(//ancestor-or-self::cac:Signature)'));

  transforms.appendChild(
    transform("not(//ancestor-or-self::cac:AdditionalDocumentReference[cbc:ID='QR'])"),
  );

  const transform4 = create(dsNs, 'ds:Transform');

  transform4.setAttribute('Algorithm', 'http://www.w3.org/2006/12/xml-c14n11');

  transforms.appendChild(transform4);

  reference.appendChild(transforms);

  const digestMethod = create(dsNs, 'ds:DigestMethod');

  digestMethod.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');

  const digestValue = create(dsNs, 'ds:DigestValue');

  digestValue.textContent = input.invoiceHash;

  reference.appendChild(digestMethod);
  reference.appendChild(digestValue);

  signedInfo.appendChild(reference);

  /*
  SignedProperties reference
  */

  const reference2 = create(dsNs, 'ds:Reference');

  reference2.setAttribute('URI', '#xadesSignedProperties');

  reference2.setAttribute('Type', 'http://www.w3.org/2000/09/xmldsig#SignatureProperties');

  const digestMethod2 = create(dsNs, 'ds:DigestMethod');

  digestMethod2.setAttribute('Algorithm', 'http://www.w3.org/2001/04/xmlenc#sha256');

  const digestValue2 = create(dsNs, 'ds:DigestValue');

  digestValue2.textContent = input.signedPropertiesHash;

  reference2.appendChild(digestMethod2);
  reference2.appendChild(digestValue2);

  signedInfo.appendChild(reference2);

  signature.appendChild(signedInfo);

  /*
  SignatureValue
  */

  const signatureValue = create(dsNs, 'ds:SignatureValue');

  signatureValue.textContent = input.signatureValue;

  signature.appendChild(signatureValue);

  /*
  Certificate
  */

  const keyInfo = create(dsNs, 'ds:KeyInfo');

  const x509Data = create(dsNs, 'ds:X509Data');

  const certificate = create(dsNs, 'ds:X509Certificate');

  const cleanCert = input.certificateBase64
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\n/g, '');

  certificate.textContent = cleanCert;

  x509Data.appendChild(certificate);
  keyInfo.appendChild(x509Data);

  signature.appendChild(keyInfo);

  /*
  SignedProperties container
  */

  const object = create(dsNs, 'ds:Object');

  const qualifyingProperties = create(xadesNs, 'xades:QualifyingProperties');

  qualifyingProperties.setAttribute('Target', '#signature');

  const signedProperties = create(xadesNs, 'xades:SignedProperties');

  signedProperties.setAttribute('Id', 'xadesSignedProperties');

  qualifyingProperties.appendChild(signedProperties);

  object.appendChild(qualifyingProperties);

  signature.appendChild(object);

  /*
  Build tree
  */

  signatureInformation.appendChild(signature);

  documentSignatures.appendChild(signatureInformation);

  const signatureBlock = new XMLSerializer().serializeToString(documentSignatures);

  return xml.replace('SIGNATURE_PLACEHOLDER', signatureBlock);
}
