export interface InvoiceItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Invoice {
  uuid: string;

  invoiceNumber: string;

  issueDate: string;

  issueTime: string;

  timestamp: string;

  sellerName: string;

  vatNumber: string;

  customerName: string;

  previousInvoiceHash?: string;

  items: InvoiceItem[];

  discount?: number;

  currency?: string;
}
export interface InvoiceTotals {
  total: number;
  vat: number;
}
