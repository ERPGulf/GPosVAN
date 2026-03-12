import { generateInvoiceHash } from '../crypto/hash.service';
import { signInvoiceHash } from '../crypto/signature.service';
import { generateSignedPropertiesHash } from '../crypto/signerProperties.service';
import { PIHService } from '../crypto/pih.service';

import { QREncoder } from '../qr/qrEncoder';

import { canonicalizeXML } from '../xml/xmlCanonicalizer';
import { XMLHelper } from '../xml/xmlHelper';
import { injectXMLSignature } from '../xml/xmlSignatureInjector';

import type { InvoiceInput, CertificateInfo, InvoicePipelineResult } from '../types';

export async function createInvoicePipeline(
  invoice: InvoiceInput,
  certificate: CertificateInfo,
  privateKey: string,
): Promise<InvoicePipelineResult> {
  try {
    const { totals } = invoice;

    /*
    ---------------------------------
    Previous Invoice Hash
    ---------------------------------
    */

    const previousHash = invoice.previousInvoiceHash ?? (await PIHService.getPreviousHash());

    /*
    ---------------------------------
    Build XML
    ---------------------------------
    */

    const xml = XMLHelper.buildInvoiceXML({
      uuid: invoice.uuid,
      invoiceNumber: invoice.number,
      invoiceDate: invoice.date,
      invoiceTime: invoice.time,

      sellerName: invoice.supplier.registrationName,
      sellerVat: invoice.supplier.vatNumber,

      previousInvoiceHash: previousHash ?? '',
      invoiceCounter: invoice.number.replace(/\D/g, ''),
      totalExclVAT: totals.totalExclVAT.toFixed(2),
      totalVAT: totals.totalVAT.toFixed(2),
      totalInclVAT: totals.totalInclVAT.toFixed(2),

      items: invoice.items,
    });

    /*
    ---------------------------------
    Remove nodes not part of hash
    ---------------------------------
    */

    const xmlForHash = XMLHelper.removeTagsForHash(xml);

    /*
    ---------------------------------
    Canonicalize XML
    ---------------------------------
    */

    const canonicalXML = canonicalizeXML(xmlForHash);

    /*
    ---------------------------------
    Generate invoice hash
    ---------------------------------
    */

    const invoiceHash = await generateInvoiceHash(canonicalXML);

    /*
    ---------------------------------
    SignedProperties hash
    ---------------------------------
    */

    const signedPropertiesHash = await generateSignedPropertiesHash(
      invoice.timestamp,
      certificate.issuer,
      certificate.serialNumber,
      certificate.certDigest,
    );

    /*
    ---------------------------------
    Sign hash
    ---------------------------------
    */

    const signature = await signInvoiceHash(invoiceHash, privateKey);

    /*
    ---------------------------------
    Inject XML Signature
    ---------------------------------
    */

    const signedXML = injectXMLSignature(xml, {
      invoiceHash,
      signedPropertiesHash,
      signatureValue: signature,
      certificateBase64: certificate.certificate,
    });

    /*
    ---------------------------------
    QR timestamp formatting
    ---------------------------------
    */

    const timestamp = invoice.timestamp.replace('Z', '').split('.')[0];

    /*
    ---------------------------------
    Generate QR TLV
    ---------------------------------
    */

    const qrBase64 = QREncoder.generate({
      seller: invoice.supplier.registrationName,
      vat: invoice.supplier.vatNumber,
      timestamp,
      total: totals.totalInclVAT.toFixed(2),
      vatTotal: totals.totalVAT.toFixed(2),
      xmlHash: invoiceHash,
      signature,
      publicKey: certificate.publicKey,
      signatureKey: certificate.signatureKey,
    });

    /*
    ---------------------------------
    Inject QR
    ---------------------------------
    */

    const finalXML = XMLHelper.injectQR(signedXML, qrBase64);

    /*
    ---------------------------------
    Store PIH
    ---------------------------------
    */

    await PIHService.storeHash(invoiceHash);

    return {
      xml: finalXML,
      hash: invoiceHash,
      signature,
      qrBase64,
      uuid: invoice.uuid,
    };
  } catch (error: any) {
    console.error('ZATCA pipeline error:', {
      message: error.message,
      stack: error.stack,
    });

    throw new Error(`ZATCA invoice pipeline failed: ${error.message}`);
  }
}
