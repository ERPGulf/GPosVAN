import { InvoiceItem } from './types';

export function calculateTotals(items: InvoiceItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const vat = subtotal * 0.15;

  return {
    total: subtotal + vat,
    vat,
  };
}
