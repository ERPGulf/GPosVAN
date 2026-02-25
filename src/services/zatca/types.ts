export interface InvoiceItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Invoice {
  sellerName: string;
  vatNumber: string;
  invoiceNumber: string;
  timestamp: string;
  items: InvoiceItem[];
  discount?: number;
}

export interface InvoiceTotals {
  total: number;
  vat: number;
}
