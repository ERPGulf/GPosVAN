import { Buffer } from 'buffer';

export interface QRPayloadInput {
    sellerName: string;
    vatNumber: string;
    timestamp: string;
    total: string;
    vat: string;
    hash: string;              // base-64 invoice hash
    signatureBase64: string;   // base-64 digital signature
    publicKeyBytes: Buffer;    // raw bytes for tag 8
    certSignatureBytes: Buffer;// raw bytes for tag 9
}

export function buildQRPayload(data: QRPayloadInput): string {
    const tagsBufsArray: Buffer[] = [];

    // Tag 1: Seller Name
    tagsBufsArray.push(getTlvForValue(1, data.sellerName));
    // Tag 2: VAT Registration Number
    tagsBufsArray.push(getTlvForValue(2, data.vatNumber));
    // Tag 3: Time Stamp (ISO 8601)
    tagsBufsArray.push(getTlvForValue(3, data.timestamp));
    // Tag 4: Invoice Total (with VAT)
    tagsBufsArray.push(getTlvForValue(4, data.total));
    // Tag 5: VAT Total
    tagsBufsArray.push(getTlvForValue(5, data.vat));
    // Tag 6: XML Hash
    // Like the Node JS reference, just supply the base64 string and UTF-8 encode it
    tagsBufsArray.push(getTlvForValue(6, data.hash));
    // Tag 7: ECDSA Signature Value
    tagsBufsArray.push(getTlvForValue(7, data.signatureBase64)); 
    // Tag 8: Public Key
    tagsBufsArray.push(getTlvForValue(8, data.publicKeyBytes));
    // Tag 9: Signature of the Public Key (ZATCA Requirement)
    tagsBufsArray.push(getTlvForValue(9, data.certSignatureBytes));

    const totalBytes = Buffer.concat(tagsBufsArray);
    return totalBytes.toString('base64');
}

export function getTlvForValue(tagNum: number, tagValue: string | Buffer | Uint8Array): Buffer {
    try {
        if (tagValue === null || tagValue === undefined) {
            throw new Error(`Error: Tag value for tag number ${tagNum} is null`);
        }

        let tagValueBytes: Buffer;

        // Step 1: Handle string or buffer tag value
        if (typeof tagValue === 'string') {
            tagValueBytes = Buffer.from(tagValue, 'utf8');
        } else if (Buffer.isBuffer(tagValue)) {
            tagValueBytes = tagValue;
        } else if (tagValue instanceof Uint8Array) {
            tagValueBytes = Buffer.from(tagValue);
        } else {
            // Fallback for numbers or objects
            tagValueBytes = Buffer.from((tagValue as any).toString(), 'utf8');
        }

        // Step 2: Determine length buffer (handles lengths > 255)
        let tagValueLenBuf: Buffer;
        if (tagValueBytes.length < 256) {
            tagValueLenBuf = Buffer.from([tagValueBytes.length]);
        } else {
            // Length > 255 requires 3 bytes: [0xFF, HighByte, LowByte]
            tagValueLenBuf = Buffer.from([
                0xFF,
                (tagValueBytes.length >> 8) & 0xFF,
                tagValueBytes.length & 0xFF
            ]);
        }

        const tagNumBuf = Buffer.from([tagNum]);

        // Step 3: Combine Tag + Length + Value
        return Buffer.concat([tagNumBuf, tagValueLenBuf, tagValueBytes]);
    } catch (ex: any) {
        throw new Error("Error in getting the TLV data value: " + ex.message);
    }
}
