import * as Crypto from 'expo-crypto';

/**
 * Generate signed properties hash matching exactly Node.js
 */
export async function generateSignedPropertiesHash(
  signingTime: string,
  issuerName: string,
  serialNumber: string,
  certificateDigest: string,
) {
  let xml = '';
  // Ensure the issuer Name is injected with commas replacing newlines
  const formattedIssuer = issuerName.replaceAll("\r\n", ", ").replaceAll("\n", ", ");
  
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
    formattedIssuer +
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

  const hexHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, xml, {
    encoding: Crypto.CryptoEncoding.HEX,
  });

  // Base64 encode the string literal of the hex representation
  const buf = Buffer.from(hexHash, 'utf8');
  return buf.toString('base64');
}
