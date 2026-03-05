/* ------------------------------------------------------------------ */
/*  ZATCA E-Invoicing – invoice totals calculation                    */
/* ------------------------------------------------------------------ */

import type { InvoiceItem, InvoiceTotals } from './types';

/**
 * Calculate a single item's line-extension (tax-exclusive) amount and its tax.
 */
export function calculateItemAmounts(
  item: InvoiceItem,
  isTaxIncludedInPrice: boolean,
): { lineExtension: number; tax: number } {
  const lineTotal = item.price * item.quantity;

  if (isTaxIncludedInPrice) {
    // Extract tax from the inclusive price
    const taxRate = item.taxPercentage / 100;
    const taxDivisor = 1 + taxRate;
    const lineExtension = lineTotal / taxDivisor;
    const tax = lineTotal - lineExtension;
    return {
      lineExtension: round2(lineExtension),
      tax: round2(tax),
    };
  }

  // Price is tax-exclusive
  const tax = lineTotal * (item.taxPercentage / 100);
  return {
    lineExtension: round2(lineTotal),
    tax: round2(tax),
  };
}

/**
 * Calculate all invoice-level totals.
 */
export function calculateTotals(
  items: InvoiceItem[],
  isTaxIncludedInPrice: boolean,
  discount: number = 0,
): InvoiceTotals {
  let subtotal = 0;

  for (const item of items) {
    const { lineExtension } = calculateItemAmounts(item, isTaxIncludedInPrice);
    subtotal += lineExtension;
  }

  subtotal = round2(subtotal);

  const taxableAmount = round2(subtotal - discount);
  const totalTax = round2(taxableAmount * 0.15); // ZATCA allows 15% standard rate

  const totalWithTax = round2(taxableAmount + totalTax);
  const payableAmount = round2(totalWithTax);

  return { subtotal, totalTax, totalWithTax, payableAmount, taxableAmount };
}

/* ─── helper ─── */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
