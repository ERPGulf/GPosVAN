import { ProductWithUom } from '../products/types';

export interface CartItem {
  product: ProductWithUom;
  quantity: number;
}
