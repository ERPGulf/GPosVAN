import { db } from '@/src/infrastructure/db/database';
import { getValidPromotion } from '@/src/infrastructure/db/promotions.repository';
import type { ProductWithUom } from '@/src/features/products/types';
import type { RootState } from '@/src/store/store';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { CartItem, PromotionItem } from './types';
import { calculateTotalDiscount } from './discountUtils';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Map a DB promotion row to the PromotionItem shape stored on CartItem. */
function mapToPromotionItem(dbResult: any): PromotionItem {
  return {
    promotionId: dbResult.promotionId,
    itemId: dbResult.id,
    discountType: dbResult.discountType || '',
    minQty: dbResult.minQty ?? 0,
    maxQty: dbResult.maxQty ?? 0,
    discountPercentage: dbResult.discountPercentage ?? 0,
    discountPrice: dbResult.discountPrice ?? 0,
    rate: dbResult.rate ?? 0,
    uomId: dbResult.uomId ?? null,
    uom: dbResult.uom ?? null,
  };
}

/** Silently look up a promotion; returns null on any error so the cart still works. */
async function lookupPromotion(
  itemCode: string,
  quantity: number,
  uom: string,
): Promise<PromotionItem | null> {
  try {
    const result = await getValidPromotion(db, itemCode, quantity, uom);
    return result ? mapToPromotionItem(result) : null;
  } catch (err) {
    if (__DEV__) {
      console.log('[Cart] Promotion lookup failed, continuing without discount:', err);
    }
    return null;
  }
}

// ─── Async Thunks ────────────────────────────────────────────────────────────

/**
 * Add a product to the cart (or increment if already present).
 * Looks up a valid promotion from local SQLite before updating state,
 * so the first render already shows the correct price.
 */
export const addToCartAsync = createAsyncThunk(
  'cart/addToCartAsync',
  async (product: ProductWithUom, { getState }) => {
    const state = getState() as RootState;
    const existingIndex = state.cart.items.findIndex(
      (item) =>
        item.product.itemCode === product.itemCode && item.product.uomId === product.uomId,
    );
    const newQty = existingIndex >= 0 ? state.cart.items[existingIndex].quantity + 1 : 1;

    const promotion = await lookupPromotion(product.itemCode || '', newQty, product.uom || '');

    return { product, existingIndex, promotion };
  },
);

/**
 * Update a cart item's quantity and re-check its promotion at the new quantity.
 * Returns null if the update results in qty < 1 (caller should ignore).
 */
export const updateQuantityAsync = createAsyncThunk(
  'cart/updateQuantityAsync',
  async (payload: { index: number; delta: number }, { getState }) => {
    const state = getState() as RootState;
    const item = state.cart.items[payload.index];
    if (!item) return null;

    const newQty = item.quantity + payload.delta;
    if (newQty < 1) return null;

    const promotion = await lookupPromotion(
      item.product.itemCode || '',
      newQty,
      item.product.uom || '',
    );

    return { index: payload.index, newQty, promotion };
  },
);

// ─── Slice ───────────────────────────────────────────────────────────────────

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
    removeFromCart(state, action: PayloadAction<number>) {
      state.items.splice(action.payload, 1);
    },

    clearCart(state) {
      state.items = [];
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(addToCartAsync.fulfilled, (state, action) => {
        const { product, existingIndex, promotion } = action.payload;
        if (existingIndex >= 0) {
          state.items[existingIndex].quantity += 1;
          state.items[existingIndex].promotion = promotion;
        } else {
          state.items.push({ product, quantity: 1, promotion });
        }
      })
      .addCase(updateQuantityAsync.fulfilled, (state, action) => {
        if (!action.payload) return;
        const { index, newQty, promotion } = action.payload;
        const item = state.items[index];
        if (!item) return;
        item.quantity = newQty;
        item.promotion = promotion;
      });
  },
});

export const { removeFromCart, clearCart } = cartSlice.actions;
export default cartSlice.reducer;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectCartItems = (state: RootState) => state.cart.items;

export const selectSubtotal = (state: RootState) =>
  state.cart.items.reduce((sum, item) => {
    const rate = item.product.uomPrice ?? item.product.price ?? 0;
    return sum + rate * item.quantity;
  }, 0);

export const selectDiscount = (state: RootState) => calculateTotalDiscount(state.cart.items);

export const selectTotal = (state: RootState) => selectSubtotal(state) - selectDiscount(state);
