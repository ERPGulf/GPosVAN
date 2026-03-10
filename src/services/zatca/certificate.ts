import { Buffer } from 'buffer';
import * as Crypto from 'expo-crypto';
import { X509Certificate } from '@peculiar/x509';

export async function getCertificateDigestValue(certBase64: string): Promise<string> {
    const pem = getCleanCertBody(certBase64);
    // Base64-decode the certificate PEM body to raw bytes
    const certDataBytes = Buffer.from(pem, 'base64');
    
    // Compute SHA-256 hash of that certificate data
    const hashBuf = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(certDataBytes));
    
    // Hash is derived, convert hex equivalent then base64
    const hexHash = Buffer.from(hashBuf).toString('hex');
    const base64EncodedHash = Buffer.from(hexHash, 'utf8').toString('base64');
    
    return base64EncodedHash;
}

export function getCleanCertBody(certBase64: string): string {
    const pem = Buffer.from(certBase64, 'base64').toString('utf8');
    return pem
        .replace('-----BEGIN CERTIFICATE-----', '')
        .replace('-----END CERTIFICATE-----', '')
        .replace(/\n/g, '')
        .trim();
}

export function getCertificateIssuer(certBase64: string): string {
    const fileName = getCleanCertBody(certBase64);
    const certPem = Buffer.from(certBase64, 'base64').toString('utf8');
    const cert = new X509Certificate(certPem);
    return cert.issuer;
}

export function getSerialNumber(certBase64: string): string {
    const certPem = Buffer.from(certBase64, 'base64').toString('utf8');
    const cert = new X509Certificate(certPem);
    
    if (typeof BigInt === 'function') {
        const serialDecimal = BigInt("0x" + cert.serialNumber);
        return serialDecimal.toString();
    } else {
        // Fallback if BigInt not supported on JS Engine
        return cert.serialNumber;
    }
}

export function getPublicKeyBytes(certBase64: string): Buffer {
    // 1. Get the Base64-encoded PEM from your constants (expected PEM)
    const publicKeyPem = Buffer.from(certBase64, 'base64').toString('utf8');
    
    // 2. Remove the PEM headers/footers and whitespace
    const base64Key = publicKeyPem
        .replace('-----BEGIN PUBLIC KEY-----', '')
        .replace('-----END PUBLIC KEY-----', '')
        .replace(/\s+/g, '');
        
    // 3. Convert that Base64 string into a Buffer
    const binaryData = Buffer.from(base64Key, 'base64');
    return binaryData;
}

export function getCertificateSignatureBytes(certBase64: string): Buffer {
    const certPem = Buffer.from(certBase64, 'base64').toString('utf8');
    const cert = new X509Certificate(certPem);
    return Buffer.from(cert.signature);
}

export function extractECPrivateKeyBytes(pemBase64: string): Uint8Array {
     // Decode the Base64 Private Key from constants
     const pemContent = Buffer.from(pemBase64, 'base64').toString('utf8').trim();
     
     // Remove PEM headers and parse to DER base64
     const base64Key = pemContent
        .replace(/-----[^-]+-----/g, '')
        .replace(/[\s\r\n]+/g, '');
        
     const der = Buffer.from(base64Key, 'base64');
     
     // Note: Expo does not natively support crypto.createPrivateKey.
     // The current ZATCA implementation needs the raw 32 byte scalar.
     for (let i = 0; i < der.length - 34; i++) {
        if (
            der[i] === 0x02 &&
            der[i + 1] === 0x01 &&
            der[i + 2] === 0x01 &&
            der[i + 3] === 0x04 &&
            der[i + 4] === 0x20
        ) {
            return der.subarray(i + 5, i + 37);
        }
    }

    for (let i = 0; i < der.length - 34; i++) {
        if (der[i] === 0x04 && der[i + 1] === 0x20) {
            return der.subarray(i + 2, i + 34);
        }
    }
    
    throw new Error('Could not find EC private key in PEM');
}
