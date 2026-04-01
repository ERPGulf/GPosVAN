import type { RootState } from '@/src/store/store';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface ShiftState {
  shiftLocalId: string | null;
  isShiftOpen: boolean;
}

const initialState: ShiftState = {
  shiftLocalId: null,
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
      state.isShiftOpen = false;
    },
  },
});

export const { openShiftState, closeShiftState } = shiftSlice.actions;
export default shiftSlice.reducer;

export const selectShiftLocalId = (state: RootState) => state.shift.shiftLocalId;
export const selectIsShiftOpen = (state: RootState) => state.shift.isShiftOpen;
