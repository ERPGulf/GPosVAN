// API Response Types for get_promotion_list endpoint

export interface ApiPromotionItem {
  id: string;
  item_code: string;
  item_name: string;
  sale_price: number;
  cost_price: number;
  discount_type: string;
  min_qty: number;
  max_qty: number;
  discount_percentage: number;
  discount_price: number;
  price_after_discount: number;
  is_free: boolean;
  uom_id: string | null;
  uom: string;
}

export interface ApiPromotion {
  id: string;
  company: string;
  disabled: number;
  valid_from: string;
  valid_upto: string;
  items: ApiPromotionItem[];
}

export interface GetPromotionsResponse {
  data: ApiPromotion[];
}
