import type { ProductWithUom } from '@/src/features/products/types';
import type { RootState } from '@/src/store/store';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { CartItem } from './types';

interface CartState {
  items: CartItem[];
}

const initialState: CartState = {
  items: [],
};

const cartSlice = createSlice({
  name: 'cart',
  initialState,
  reducers: {
    addToCart(state, action: PayloadAction<ProductWithUom>) {
      const product = action.payload;
      const existingIndex = state.items.findIndex(
        (item) =>
          item.product.itemCode === product.itemCode && item.product.uomId === product.uomId,
      );
      if (existingIndex >= 0) {
        state.items[existingIndex].quantity += 1;
      } else {
        state.items.push({ product, quantity: 1 });
      }
    },

    removeFromCart(state, action: PayloadAction<number>) {
      state.items.splice(action.payload, 1);
    },

    updateQuantity(state, action: PayloadAction<{ index: number; delta: number }>) {
      const { index, delta } = action.payload;
      const item = state.items[index];
      if (!item) return;
      const newQuantity = item.quantity + delta;
      if (newQuantity < 1) return; // clamp to minimum 1
      item.quantity = newQuantity;
    },

    clearCart(state) {
      state.items = [];
    },
  },
});

export const { addToCart, removeFromCart, updateQuantity, clearCart } = cartSlice.actions;
export default cartSlice.reducer;

export const selectCartItems = (state: RootState) => state.cart.items;

export const selectSubtotal = (state: RootState) =>
  state.cart.items.reduce((sum, item) => {
    const rate = item.product.uomPrice ?? item.product.price ?? 0;
    return sum + rate * item.quantity;
  }, 0);

export const selectDiscount = (_state: RootState) => 0; // Discount logic to be implemented

export const selectTotal = (state: RootState) => selectSubtotal(state) - selectDiscount(state);
