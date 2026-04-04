import type { RootState } from '@/src/store/store';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ShiftState {
  shiftLocalId: string | null;
  shiftOpeningId: string | null;
  isShiftOpen: boolean;
}

const initialState: ShiftState = {
  shiftLocalId: null,
  shiftOpeningId: null,
  isShiftOpen: false,
};

const shiftSlice = createSlice({
  name: 'shift',
  initialState,
  reducers: {
    openShiftState(state, action: PayloadAction<string>) {
      state.shiftLocalId = action.payload;
      state.isShiftOpen = true;
    },
    closeShiftState(state) {
      state.shiftLocalId = null;
      state.shiftOpeningId = null;
      state.isShiftOpen = false;
    },
    setShiftOpeningId(state, action: PayloadAction<string>) {
      state.shiftOpeningId = action.payload;
    },
    resetShiftState() {
      return initialState;
    },
  },
});

export const { openShiftState, closeShiftState, setShiftOpeningId, resetShiftState } = shiftSlice.actions;
export default shiftSlice.reducer;

export const selectShiftLocalId = (state: RootState) => state.shift.shiftLocalId;
export const selectShiftOpeningId = (state: RootState) => state.shift.shiftOpeningId;
export const selectIsShiftOpen = (state: RootState) => state.shift.isShiftOpen;

