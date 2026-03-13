import { Paths } from 'expo-file-system';

export class Constants {
  static getInvoiceDirectory(invoiceNo: string): string {
    return `${Paths.document}/invoices/${invoiceNo}`;
  }

  static getSalesReturnDirectory(invoiceNo: string): string {
    return `${Paths.document}/salesReturns/${invoiceNo}`;
  }
}
