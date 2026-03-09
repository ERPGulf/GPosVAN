/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – hashing utilities                             */
/*                                                                    */
/*  Provides invoice hash and signed-properties hash generation.      */
/*  Uses a minimal C14N 1.1 implementation (xmldom for DOM parsing,   */
/*  custom serialization) to avoid xmldom's XMLSerializer which does   */
/*  NOT produce proper canonical XML.                                 */
/* ------------------------------------------------------------------ */

import * as Crypto from 'expo-crypto';
import { DOMParser } from 'xmldom';


/* ====================================================================
 * 1. Remove signature-related nodes (string-based, preserves bytes)
 * ==================================================================== */

function removeSignatureNodes(xml: string): string {
  let result = xml;

  // Remove <ext:UBLExtensions>...</ext:UBLExtensions>
  // Note: Do NOT consume leading whitespace — ZATCA XPath transforms remove
  // only the element nodes, leaving surrounding whitespace intact.
  result = result.replace(/<ext:UBLExtensions[\s\S]*?<\/ext:UBLExtensions>/g, '');

  // Remove <cac:Signature>...</cac:Signature>
  result = result.replace(/<cac:Signature>[\s\S]*?<\/cac:Signature>/g, '');

  // Remove <cac:AdditionalDocumentReference> that contains <cbc:ID>QR</cbc:ID>
  result = result.replace(
    /<cac:AdditionalDocumentReference>\s*<cbc:ID>QR<\/cbc:ID>[\s\S]*?<\/cac:AdditionalDocumentReference>/g,
    '',
  );

  return result;
}

/* ====================================================================
 * 2. Minimal C14N 1.1 serializer
 *
 * Uses xmldom for DOM parsing, then walks the tree and serializes
 * following C14N 1.1 rules:
 *   - No XML declaration
 *   - Namespace declarations sorted alphabetically by prefix
 *   - Regular attributes sorted by namespace URI then local name
 *   - Empty elements output as start+end tag pair (no self-closing)
 *   - Text content preserved as-is (with XML escaping)
 *   - Comments excluded
 * ==================================================================== */

function canonicalize(xml: string): string {
  // Remove XML declaration first
  const cleaned = xml.replace(/<\?xml[^?]*\?>\s*/g, '');

  const doc = new DOMParser().parseFromString(cleaned, 'text/xml');
  if (!doc.documentElement) return cleaned;

  return serializeNodeC14n(doc.documentElement, new Map<string, string>());
}

function serializeNodeC14n(node: Node, inheritedNs: Map<string, string>): string {
  // Text node
  if (node.nodeType === 3) {
    return escapeC14nText(node.nodeValue || '');
  }

  // Skip comments, processing instructions, etc.
  if (node.nodeType !== 1) return '';

  const el = node as Element;
  const tagName = el.tagName;

  // Collect namespace declarations and regular attributes
  const nsDecls: Array<[string, string]> = [];
  const attrs: Array<[string, string]> = [];

  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (attr.name === 'xmlns' || attr.name.startsWith('xmlns:')) {
      nsDecls.push([attr.name, attr.value]);
    } else {
      attrs.push([attr.name, attr.value]);
    }
  }

  // Determine which namespace declarations are new/changed vs inherited
  const currentNs = new Map(inheritedNs);
  const outputNs: Array<[string, string]> = [];

  for (const [name, value] of nsDecls) {
    const prefix = name === 'xmlns' ? '' : name.substring(6);
    if (inheritedNs.get(prefix) !== value) {
      outputNs.push([name, value]);
    }
    currentNs.set(prefix, value);
  }

  // Sort namespace declarations: default ns first, then alphabetically by prefix
  outputNs.sort((a, b) => {
    if (a[0] === 'xmlns') return -1;
    if (b[0] === 'xmlns') return 1;
    return a[0].localeCompare(b[0]);
  });

  // Sort regular attributes alphabetically by qualified name
  attrs.sort((a, b) => a[0].localeCompare(b[0]));

  // Build opening tag
  let result = '<' + tagName;

  for (const [name, value] of outputNs) {
    result += ' ' + name + '="' + escapeC14nAttr(value) + '"';
  }
  for (const [name, value] of attrs) {
    result += ' ' + name + '="' + escapeC14nAttr(value) + '"';
  }

  result += '>';

  // Serialize children
  for (let i = 0; i < el.childNodes.length; i++) {
    result += serializeNodeC14n(el.childNodes[i], currentNs);
  }

  // Closing tag (C14N never uses self-closing)
  result += '</' + tagName + '>';

  return result;
}

/** C14N text escaping: &, <, >, \r */
function escapeC14nText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;');
}

/** C14N attribute value escaping: &, <, ", \t, \n, \r */
function escapeC14nAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;');
}

/* ====================================================================
 * 3. Invoice hash generation
 * ==================================================================== */

/**
 * Generate invoice hash matching C# GetInvoiceHash:
 *   SHA256(canonicalXml) → { hex, base64 }
 */
export async function generateInvoiceHash(xml: string) {
  // STEP 1: remove signature/QR/extension nodes
  const stripped = removeSignatureNodes(xml);

  // STEP 2: canonicalize (C14N 1.1)
  const canonicalXml = canonicalize(stripped);

  // STEP 3: hash — base64
  const base64Hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalXml,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );

  // STEP 4: hash — hex (needed for signing)
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

/* ====================================================================
 * 4. Signed properties hash generation
 * ==================================================================== */

/**
 * Generate signed properties hash matching C# GenerateSignedPropertiesHash.
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

  // Compute standard SHA256 digest of the XML, encode to Base64
  const base64Hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, xml, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });

  return base64Hash;
}
