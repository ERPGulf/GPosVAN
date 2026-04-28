import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '@/src/store/store';
import type { OriginalInvoice, SplitInvoiceItem } from '@/src/infrastructure/db/salesReturn.repository';
import type { ReturnLineItem } from './types';
import { calculateRefundAmount } from '@/src/infrastructure/db/salesReturn.repository';

// ─── State ───────────────────────────────────────────────────────────────────

export type SalesReturnStatus = 'idle' | 'searching' | 'found' | 'not_found' | 'saving' | 'done' | 'error';

interface SalesReturnState {
  /** Search input value */
  searchTerm: string;

  /** The original invoice loaded from DB */
  originalInvoice: OriginalInvoice | null;

  /** Items from the original invoice, split by promotion eligibility */
  splitItems: SplitInvoiceItem[];

  /** Items selected for return with their quantities */
  returnItems: ReturnLineItem[];

  /** Calculated refund amount (positive) */
  refundAmount: number;

  /** Return reason text */
  reason: string;

  /** Customer mobile number */
  mobile: string;

  /** Current flow status */
  status: SalesReturnStatus;

  /** Error message if status === 'error' */
  error: string | null;
}

const initialState: SalesReturnState = {
  searchTerm: '',
  originalInvoice: null,
  splitItems: [],
  returnItems: [],
  refundAmount: 0,
  reason: '',
  mobile: '',
  status: 'idle',
  error: null,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Recompute the refund amount from the current return items. */
function recomputeRefund(returnItems: ReturnLineItem[]): number {
  return calculateRefundAmount(
    returnItems.map((item) => ({
      itemCode: item.itemCode,
      itemName: item.itemName,
      quantity: item.availableQty,
      rate: item.rate,
      taxRate: item.taxRate,
      uom: item.uom,
      discountType: item.discountType,
      discountValue: item.discountValue,
      minQty: item.minQty,
      maxQty: item.maxQty,
      returnQty: item.returnQty,
    })),
  );
}

// ─── Slice ───────────────────────────────────────────────────────────────────

const salesReturnSlice = createSlice({
  name: 'salesReturn',
  initialState,
  reducers: {
    /** Update the search input */
    setSearchTerm(state, action: PayloadAction<string>) {
      state.searchTerm = action.payload;
    },

    /** Set status to 'searching' when lookup begins */
    setSearching(state) {
      state.status = 'searching';
      state.error = null;
      state.originalInvoice = null;
      state.splitItems = [];
      state.returnItems = [];
      state.refundAmount = 0;
    },

    /** Invoice found — populate the state */
    setInvoiceFound(state, action: PayloadAction<{ invoice: OriginalInvoice; splitItems: SplitInvoiceItem[] }>) {
      state.originalInvoice = action.payload.invoice;
      state.splitItems = action.payload.splitItems;
      state.returnItems = [];
      state.refundAmount = 0;
      state.status = 'found';
      state.error = null;
    },

    /** Invoice not found */
    setInvoiceNotFound(state) {
      state.status = 'not_found';
      state.error = 'Invoice not found. Please check the invoice number and try again.';
    },

    /** Add a split item to the return list (default returnQty = 1) */
    addReturnItem(state, action: PayloadAction<number>) {
      const splitIndex = action.payload;
      const splitItem = state.splitItems[splitIndex];
      if (!splitItem) return;

      // Don't add if already in the return list
      const exists = state.returnItems.some((item) => item.splitIndex === splitIndex);
      if (exists) return;

      state.returnItems.push({
        splitIndex,
        itemCode: splitItem.itemCode,
        itemName: splitItem.itemName,
        availableQty: splitItem.quantity,
        returnQty: 1,
        rate: splitItem.rate,
        taxRate: splitItem.taxRate,
        uom: splitItem.uom,
        discountType: splitItem.discountType,
        discountValue: splitItem.discountValue,
        minQty: splitItem.minQty,
        maxQty: splitItem.maxQty,
      });

      state.refundAmount = recomputeRefund(state.returnItems);
    },

    /** Remove an item from the return list by its index in returnItems */
    removeReturnItem(state, action: PayloadAction<number>) {
      state.returnItems.splice(action.payload, 1);
      state.refundAmount = recomputeRefund(state.returnItems);
    },

    /** Update the return quantity for an item (+1 or -1) */
    updateReturnQty(state, action: PayloadAction<{ index: number; delta: number }>) {
      const { index, delta } = action.payload;
      const item = state.returnItems[index];
      if (!item) return;

      const newQty = item.returnQty + delta;
      if (newQty < 1 || newQty > item.availableQty) return;

      item.returnQty = newQty;
      state.refundAmount = recomputeRefund(state.returnItems);
    },

    /** Set the return reason text */
    setReason(state, action: PayloadAction<string>) {
      state.reason = action.payload;
    },

    /** Set the customer mobile number */
    setMobile(state, action: PayloadAction<string>) {
      state.mobile = action.payload;
    },

    /** Set status to 'saving' when the return process begins */
    setSaving(state) {
      state.status = 'saving';
      state.error = null;
    },

    /** Return processed successfully */
    setDone(state) {
      state.status = 'done';
    },

    /** Set an error */
    setError(state, action: PayloadAction<string>) {
      state.status = 'error';
      state.error = action.payload;
    },

    /** Reset to initial state (after completion or navigation away) */
    resetSalesReturn() {
      return initialState;
    },
  },
});

export const {
  setSearchTerm,
  setSearching,
  setInvoiceFound,
  setInvoiceNotFound,
  addReturnItem,
  removeReturnItem,
  updateReturnQty,
  setReason,
  setMobile,
  setSaving,
  setDone,
  setError,
  resetSalesReturn,
} = salesReturnSlice.actions;

export default salesReturnSlice.reducer;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectSalesReturnState = (state: RootState) => state.salesReturn;
export const selectSearchTerm = (state: RootState) => state.salesReturn.searchTerm;
export const selectOriginalInvoice = (state: RootState) => state.salesReturn.originalInvoice;
export const selectSplitItems = (state: RootState) => state.salesReturn.splitItems;
export const selectReturnItems = (state: RootState) => state.salesReturn.returnItems;
export const selectRefundAmount = (state: RootState) => state.salesReturn.refundAmount;
export const selectReason = (state: RootState) => state.salesReturn.reason;
export const selectMobile = (state: RootState) => state.salesReturn.mobile;
export const selectSalesReturnStatus = (state: RootState) => state.salesReturn.status;
export const selectSalesReturnError = (state: RootState) => state.salesReturn.error;

/** Whether the form is valid and ready to submit */
export const selectCanSubmit = (state: RootState): boolean => {
  const sr = state.salesReturn;
  return (
    sr.returnItems.length > 0 &&
    sr.reason.trim().length >= 3 &&
    sr.mobile.replace(/\D/g, '').length >= 9 &&
    sr.status === 'found'
  );
};
