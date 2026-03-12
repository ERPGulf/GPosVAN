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

    const previousHash = invoice.previousInvoiceHash ?? (await PIHService.getPreviousHash());

    /*
    Build XML
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
    Remove nodes excluded from hash
    */

    const xmlForHash = XMLHelper.removeTagsForHash(xml);

    /*
    Canonicalize
    */

    const canonicalXML = canonicalizeXML(xmlForHash);

    /*
    Invoice hash
    */

    const invoiceHash = await generateInvoiceHash(canonicalXML);

    /*
    SignedProperties hash
    */

    const signingTime = invoice.timestamp.split('.')[0].replace('Z', '');

    const signedPropertiesHash = await generateSignedPropertiesHash(
      signingTime,
      certificate.issuer,
      certificate.serialNumber,
      certificate.certDigest,
    );

    /*
    Sign invoice
    */

    const signature = await signInvoiceHash(invoiceHash, privateKey);

    /*
    Inject XML Signature
    */

    const signedXML = injectXMLSignature(xml, {
      invoiceHash,
      signedPropertiesHash,
      signatureValue: signature,
      certificateBase64: certificate.certificate,
    });

    /*
    Generate QR
    */

    const qrBase64 = QREncoder.generate({
      seller: invoice.supplier.registrationName,
      vat: invoice.supplier.vatNumber,
      timestamp: signingTime,
      total: totals.totalInclVAT.toFixed(2),
      vatTotal: totals.totalVAT.toFixed(2),
      xmlHash: invoiceHash,
      signature,
      publicKey: certificate.publicKey,
      signatureKey: certificate.signatureKey,
    });

    /*
    Inject QR
    */

    const finalXML = XMLHelper.injectQR(signedXML, qrBase64);

    await PIHService.storeHash(invoiceHash);

    return {
      xml: finalXML,
      hash: invoiceHash,
      signature,
      qrBase64,
      uuid: invoice.uuid,
    };
  } catch (error: any) {
    console.error('ZATCA pipeline error:', error);
    throw new Error(`ZATCA invoice pipeline failed: ${error.message}`);
  }
}
