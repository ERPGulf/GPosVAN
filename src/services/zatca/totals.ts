import { InvoiceItem } from './types';

export function calculateTotals(items: InvoiceItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  // VAT is fixed at 15% for this example, but in a real application, it might be dynamic based on the item category or other factors.
  const vat = subtotal * 0.15;

  return {
    total: subtotal + vat,
    vat,
  };
}
