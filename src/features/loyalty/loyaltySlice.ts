import type { RootState } from '@/src/store/store';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { LoyaltyState } from './types';

const initialState: LoyaltyState = {
  loyaltyAmount: 0,
  loyaltyPoints: 0,
  customerMobile: '',
  isApplied: false,
};

const loyaltySlice = createSlice({
  name: 'loyalty',
  initialState,
  reducers: {
    /**
     * Apply loyalty points after successful OTP verification.
     */
    applyLoyalty(
      state,
      action: PayloadAction<{
        amount: number;
        points: number;
        mobile: string;
      }>,
    ) {
      state.loyaltyAmount = action.payload.amount;
      state.loyaltyPoints = action.payload.points;
      state.customerMobile = action.payload.mobile;
      state.isApplied = true;
    },

    /**
     * Clear loyalty state — called when cart is cleared or invoice is completed.
     */
    clearLoyalty() {
      return initialState;
    },
  },
});

export const { applyLoyalty, clearLoyalty } = loyaltySlice.actions;
export default loyaltySlice.reducer;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectLoyaltyAmount = (state: RootState) => state.loyalty.loyaltyAmount;
export const selectLoyaltyPoints = (state: RootState) => state.loyalty.loyaltyPoints;
export const selectIsLoyaltyApplied = (state: RootState) => state.loyalty.isApplied;
export const selectLoyaltyMobile = (state: RootState) => state.loyalty.customerMobile;
