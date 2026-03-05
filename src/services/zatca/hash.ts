import * as Crypto from 'expo-crypto';
import { SignedXml } from 'xml-crypto';
import { DOMParser, XMLSerializer } from 'xmldom';
import * as xpath from 'xpath';

function removeSignatureNodes(xml: string): string {
  const doc = new DOMParser().parseFromString(xml);

  const select = xpath.useNamespaces({
    ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
    cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  });

  // Remove UBLExtensions
  const extNodes = select('//ext:UBLExtensions', doc) as Node[];
  extNodes.forEach((n) => n.parentNode?.removeChild(n));

  // Remove Signature
  const sigNodes = select('//cac:Signature', doc) as Node[];
  sigNodes.forEach((n) => n.parentNode?.removeChild(n));

  // Remove QR reference
  const qrNodes = select("//cac:AdditionalDocumentReference[cbc:ID='QR']", doc) as Node[];

  qrNodes.forEach((n) => n.parentNode?.removeChild(n));

  return new XMLSerializer().serializeToString(doc);
}

function canonicalize(xml: string): string {
  return xml
    .replace(/\r?\n|\r/g, '') // remove line breaks
    .replace(/>\s+</g, '><') // remove spaces between tags
    .replace(/>\s+/g, '>') // trim start inside tag
    .replace(/\s+</g, '<') // trim end inside tag
    .trim();
}

export async function generateInvoiceHash(xml: string) {
  // STEP 1 remove nodes
  const stripped = removeSignatureNodes(xml);

  // STEP 2 canonicalize
  const canonicalXml = canonicalize(stripped);

  // STEP 3 hash
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalXml, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });

  const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonicalXml, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

  return {
    canonicalXml,
    base64: hash,
    hex,
  };
}
export async function generateSignedPropertiesHash(
  signingTime: string,
  issuerName: string,
  serialNumber: string,
  certificateDigest: string,
) {
  const xml = `<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">
<xades:SignedSignatureProperties>
<xades:SigningTime>${signingTime}</xades:SigningTime>
<xades:SigningCertificate>
<xades:Cert>
<xades:CertDigest>
<ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
<ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${certificateDigest}</ds:DigestValue>
</xades:CertDigest>
<xades:IssuerSerial>
<ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${issuerName}</ds:X509IssuerName>
<ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">${serialNumber}</ds:X509SerialNumber>
</xades:IssuerSerial>
</xades:Cert>
</xades:SigningCertificate>
</xades:SignedSignatureProperties>
</xades:SignedProperties>`;

  const hashBytes = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, xml, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

  const utf8Bytes = new TextEncoder().encode(hashBytes);

  const base64 = btoa(String.fromCharCode(...utf8Bytes));

  return base64;
}
