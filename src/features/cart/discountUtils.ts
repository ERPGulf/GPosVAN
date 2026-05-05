import type { CartItem, PromotionItem } from './types';

/**
 * Get the effective discounted unit price for a promoted item.
 * - RATE:       The discountPrice IS the new rate (overridden fixed price).
 * - PERCENTAGE: Reduce original rate by the given percentage.
 * - AMOUNT:     Subtract a flat amount from the original rate.
 */
export function getDiscountedUnitPrice(originalRate: number, promotion: PromotionItem): number {
  switch (promotion.discountType) {
    case 'RATE':
      return promotion.discountPrice;
    case 'PERCENTAGE':
      return originalRate * (1 - promotion.discountPercentage / 100);
    case 'AMOUNT':
      return originalRate - promotion.discountPrice;
    default:
      return originalRate;
  }
}

/**
 * Calculate the total discount saved for a single cart item.
 * Only up to MaxQty items receive the discount; the rest are at full price.
 */
export function calculateItemDiscount(item: CartItem): number {
  if (!item.promotion) return 0;

  const originalRate = item.product.uomPrice ?? item.product.price ?? 0;
  const eligibleQty = Math.min(item.quantity, item.promotion.maxQty);
  const discountedRate = getDiscountedUnitPrice(originalRate, item.promotion);
  const discountPerUnit = originalRate - discountedRate;

  return discountPerUnit * eligibleQty;
}

/**
 * Calculate the total discount across all cart items.
 */
export function calculateTotalDiscount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + calculateItemDiscount(item), 0);
}

/**
 * Calculate the effective line total for a cart item (accounting for promotion).
 * Items up to MaxQty get discounted price, the remainder at full price.
 */
export function calculateItemTotal(item: CartItem): number {
  const originalRate = item.product.uomPrice ?? item.product.price ?? 0;

  if (!item.promotion) {
    return originalRate * item.quantity;
  }

  const eligibleQty = Math.min(item.quantity, item.promotion.maxQty);
  const remainingQty = item.quantity - eligibleQty;
  const discountedRate = getDiscountedUnitPrice(originalRate, item.promotion);

  return discountedRate * eligibleQty + originalRate * remainingQty;
}

/**
 * Get the discount value to store in the invoice DiscountValue column.
 * - RATE:       The override price (discountPrice)
 * - PERCENTAGE: The percentage value (discountPercentage)
 * - AMOUNT:     The flat deduction (discountPrice)
 */
export function getDiscountValueForInvoice(promotion: PromotionItem): number {
  switch (promotion.discountType) {
    case 'RATE':
      return promotion.discountPrice;
    case 'PERCENTAGE':
      return promotion.discountPercentage;
    case 'AMOUNT':
      return promotion.discountPrice;
    default:
      return 0;
  }
}

/**
 * Calculate total VAT for all cart items (after promo discounts).
 *
 * @param isTaxIncluded - When true, item prices already contain VAT and we
 *   back-calculate to extract the tax portion. When false, VAT is computed
 *   forward on top of the net line amount.
 */
export function calculateCartTax(items: CartItem[], isTaxIncluded: boolean): number {
  let totalTax = 0;

  for (const item of items) {
    const lineTotal = calculateItemTotal(item);
    const taxPct = item.product.taxPercentage || 15;

    if (isTaxIncluded) {
      // Back-calculate: tax = amount - amount / (1 + pct/100)
      totalTax += lineTotal - lineTotal / (1 + taxPct / 100);
    } else {
      // Forward-calculate: tax = amount * pct / 100
      totalTax += (lineTotal * taxPct) / 100;
    }
  }

  return Math.round(totalTax * 100) / 100;
}
