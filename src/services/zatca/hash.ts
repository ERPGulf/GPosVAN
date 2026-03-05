import * as Crypto from 'expo-crypto';
import { DOMParser, XMLSerializer } from 'xmldom';
import * as xpath from 'xpath';
import { bytesToBase64 } from './certificate';

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

/**
 * Canonicalize XML for ZATCA hashing.
 * Matches C# CanonicalizeXml flow:
 *   1. Save XML with whitespace tweaks
 *   2. Apply C14N transform (we approximate with xmldom re-serialize which strips XML declaration)
 *
 * The C# code applies these replacements before C14N:
 *   xmlText.Replace("<cbc:ProfileID>", "\n  <cbc:ProfileID>");
 *   xmlText.Replace("<cac:AccountingSupplierParty>", "\n  \n  <cac:AccountingSupplierParty>");
 */
function canonicalize(xml: string): string {
  // Remove XML declaration (<?xml ...?>)  — C14N removes it
  let result = xml.replace(/<\?xml[^?]*\?>\s*/g, '');

  // Parse and re-serialize via xmldom for consistent output
  const doc = new DOMParser().parseFromString(result);
  result = new XMLSerializer().serializeToString(doc);

  // C# whitespace workarounds (applied before C14N in the C# code)
  result = result.replace('<cbc:ProfileID>', '\n  <cbc:ProfileID>');
  result = result.replace('<cac:AccountingSupplierParty>', '\n  \n  <cac:AccountingSupplierParty>');

  return result;
}

/**
 * Generate invoice hash matching C# GetInvoiceHash:
 *   SHA256(canonicalXml) → { hex, base64 }
 */
export async function generateInvoiceHash(xml: string) {
  // STEP 1 remove nodes
  const stripped = removeSignatureNodes(xml);

  // STEP 2 canonicalize
  const canonicalXml = canonicalize(stripped);

  // STEP 3 hash — base64
  const base64Hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalXml,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );

  // STEP 4 hash — hex (needed for signing, matching C# Item1)
  const hexHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalXml,
    { encoding: Crypto.CryptoEncoding.HEX },
  );

  return {
    canonicalXml,
    base64: base64Hash,
    hex: hexHash,
  };
}

/**
 * Generate signed properties hash matching C# GenerateSignedPropertiesHash EXACTLY.
 *
 * C# flow:
 *   1. Build XML template with exact whitespace (36/40/44/48/52 leading spaces)
 *   2. SHA256(UTF8Bytes(xmlTemplate))
 *   3. hex string of hash
 *   4. UTF8Bytes(hexString) → base64
 *
 * CRITICAL: The indentation must match the C# exactly, byte for byte.
 */
export async function generateSignedPropertiesHash(
  signingTime: string,
  issuerName: string,
  serialNumber: string,
  certificateDigest: string,
) {
  // Build template matching C# GenerateSignedPropertiesHash exactly
  // Each line ends with \n, indentation uses exact space counts from C#
  let xml = '';
  xml +=
    '<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">\n';
  xml += '                                    <xades:SignedSignatureProperties>\n';
  xml +=
    '                                        <xades:SigningTime>' +
    signingTime +
    '</xades:SigningTime>\n';
  xml += '                                        <xades:SigningCertificate>\n';
  xml += '                                            <xades:Cert>\n';
  xml += '                                                <xades:CertDigest>\n';
  xml +=
    '                                                    <ds:DigestMethod xmlns:ds="http://www.w3.org/2000/09/xmldsig#" Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>\n';
  xml +=
    '                                                    <ds:DigestValue xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' +
    certificateDigest +
    '</ds:DigestValue>\n';
  xml += '                                                </xades:CertDigest>\n';
  xml += '                                                <xades:IssuerSerial>\n';
  xml +=
    '                                                    <ds:X509IssuerName xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' +
    issuerName +
    '</ds:X509IssuerName>\n';
  xml +=
    '                                                    <ds:X509SerialNumber xmlns:ds="http://www.w3.org/2000/09/xmldsig#">' +
    serialNumber +
    '</ds:X509SerialNumber>\n';
  xml += '                                                </xades:IssuerSerial>\n';
  xml += '                                            </xades:Cert>\n';
  xml += '                                        </xades:SigningCertificate>\n';
  xml += '                                    </xades:SignedSignatureProperties>\n';
  xml += '                                </xades:SignedProperties>';

  // C# flow: SHA256 → hex → UTF8Bytes(hex) → base64
  const hexHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, xml, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

  return bytesToBase64(new TextEncoder().encode(hexHash));
}
