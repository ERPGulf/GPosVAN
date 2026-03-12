import * as Crypto from 'expo-crypto';

export async function generateSignedPropertiesHash(
  signingTime: string,
  issuer: string,
  serial: string,
  certDigest: string,
) {
  const xml = `
<xades:SignedProperties xmlns:xades="http://uri.etsi.org/01903/v1.3.2#" Id="xadesSignedProperties">
<xades:SignedSignatureProperties>
<xades:SigningTime>${signingTime}</xades:SigningTime>
<xades:SigningCertificate>
<xades:Cert>
<xades:CertDigest>
<ds:DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"/>
<ds:DigestValue>${certDigest}</ds:DigestValue>
</xades:CertDigest>
<xades:IssuerSerial>
<ds:X509IssuerName>${issuer}</ds:X509IssuerName>
<ds:X509SerialNumber>${serial}</ds:X509SerialNumber>
</xades:IssuerSerial>
</xades:Cert>
</xades:SigningCertificate>
</xades:SignedSignatureProperties>
</xades:SignedProperties>
`;

  return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, xml);
}
