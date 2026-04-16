import type { AppConfig } from '@/src/features/app/types';
import type { RootState } from '@/src/store/store';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppConfigState {
  config: AppConfig | null;
  isLoaded: boolean;
}

const initialState: AppConfigState = {
  config: null,
  isLoaded: false,
};

const appConfigSlice = createSlice({
  name: 'appConfig',
  initialState,
  reducers: {
    setAppConfig(state, action: PayloadAction<AppConfig>) {
      state.config = action.payload;
      state.isLoaded = true;
    },
    clearAppConfig(state) {
      state.config = null;
      state.isLoaded = false;
    },
  },
});

export const { setAppConfig, clearAppConfig } = appConfigSlice.actions;
export default appConfigSlice.reducer;

// ─── Selectors ───────────────────────────────────────────────────────────────

export const selectAppConfig = (state: RootState) => state.appConfig.config;
export const selectIsAppConfigLoaded = (state: RootState) => state.appConfig.isLoaded;
