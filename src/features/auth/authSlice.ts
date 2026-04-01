import { User } from '@/src/infrastructure/db/users.repository';
import type { RootState } from '@/src/store/store';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// User type without password
export type AuthUser = Omit<User, 'password'>;

interface AuthState {
  user: AuthUser | null;
  selectedPosProfile: string | null;
}

const initialState: AuthState = {
  user: null,
  selectedPosProfile: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    login(state, action: PayloadAction<User>) {
      state.user = action.payload;
    },
    logout(state) {
      state.user = null;
      state.selectedPosProfile = null;
    },
    setPosProfile(state, action: PayloadAction<string>) {
      state.selectedPosProfile = action.payload;
    },
  },
});

export const { login, logout, setPosProfile } = authSlice.actions;
export default authSlice.reducer;

export const selectUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => !!state.auth.user;
export const selectSelectedPosProfile = (state: RootState) => state.auth.selectedPosProfile;
