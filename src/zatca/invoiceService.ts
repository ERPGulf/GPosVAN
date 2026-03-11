import { Logger } from '../utils/logger';
import { InvoiceGenerationError, InvoiceValidationError } from './errors';
import { QREncoder } from './qrEncder';
import { XMLHelper } from './xmlHelper';

export interface InvoiceItem {
  name: string;
  qty: number;
  price: number;
}

export interface InvoiceInput {
  number: string;
  date: string;
  time?: string;
  items: InvoiceItem[];
}

export interface InvoiceConfig {
  sellerName: string;
  sellerTaxId: string;
  vatRate?: number;
}

export interface InvoiceResult {
  xml: string;
  qrBase64: string;
  totals: {
    totalExclVAT: number;
    totalVAT: number;
    totalInclVAT: number;
  };
}

const SCOPE = 'InvoiceService';

export class InvoiceService {
  private static round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private static validateInvoice(invoice: InvoiceInput) {
    if (!invoice.items || invoice.items.length === 0) {
      throw new InvoiceValidationError('Invoice must contain at least one item');
    }

    for (const item of invoice.items) {
      if (item.qty <= 0) {
        throw new InvoiceValidationError(`Invalid quantity for item ${item.name}`);
      }

      if (item.price < 0) {
        throw new InvoiceValidationError(`Invalid price for item ${item.name}`);
      }
    }
  }

  private static calculateTotals(items: InvoiceItem[], vatRate: number) {
    const totalExclVAT = items.reduce((sum, item) => sum + item.qty * item.price, 0);

    const totalVAT = totalExclVAT * vatRate;
    const totalInclVAT = totalExclVAT + totalVAT;

    return {
      totalExclVAT: this.round(totalExclVAT),
      totalVAT: this.round(totalVAT),
      totalInclVAT: this.round(totalInclVAT),
    };
  }

  private static buildTimestamp(date: string, time?: string) {
    if (time) {
      return `${date}T${time}`;
    }

    return new Date().toISOString();
  }

  async generate(config: InvoiceConfig, invoice: InvoiceInput): Promise<InvoiceResult> {
    try {
      Logger.info(SCOPE, 'Starting invoice generation', {
        invoiceNumber: invoice.number,
      });

      InvoiceService.validateInvoice(invoice);

      const vatRate = config.vatRate ?? 0.15;

      const totals = InvoiceService.calculateTotals(invoice.items, vatRate);

      Logger.info(SCOPE, 'Totals calculated', totals);

      const timestamp = InvoiceService.buildTimestamp(invoice.date, invoice.time);

      const qrBase64 = QREncoder.generateSimplified({
        seller: config.sellerName,
        vat: config.sellerTaxId,
        timestamp,
        total: totals.totalInclVAT.toFixed(2),
        vatTotal: totals.totalVAT.toFixed(2),
      });

      Logger.info(SCOPE, 'QR generated');

      const xml = XMLHelper.buildInvoiceXML({
        invoiceNumber: invoice.number,
        invoiceDate: invoice.date,
        sellerName: config.sellerName,
        totalExclVAT: totals.totalExclVAT.toFixed(2),
        totalInclVAT: totals.totalInclVAT.toFixed(2),
      });

      Logger.info(SCOPE, 'XML generated successfully');

      return {
        xml,
        qrBase64,
        totals,
      };
    } catch (error) {
      Logger.error(SCOPE, 'Invoice generation failed', error);

      if (error instanceof InvoiceValidationError) {
        throw error;
      }

      throw new InvoiceGenerationError('Failed to generate invoice', error);
    }
  }
}
