import { ProductWithUom } from '../products/types';

/** Promotion rule attached to a cart item after DB lookup. */
export interface PromotionItem {
  promotionId: string;
  itemId: string;
  discountType: string; // 'RATE' | 'PERCENTAGE' | 'AMOUNT'
  minQty: number;
  maxQty: number;
  discountPercentage: number;
  discountPrice: number;
  rate: number; // original sale price from the promotion rule
  uomId: string | null;
  uom: string | null;
}

export interface CartItem {
  product: ProductWithUom;
  quantity: number;
  promotion?: PromotionItem | null;
}
