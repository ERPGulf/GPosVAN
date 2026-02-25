import { User } from '@/src/infrastructure/db/users.repository';
import type { RootState } from '@/src/store/store';
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// User type without password
export type AuthUser = Omit<User, 'password'>;

interface AuthState {
  user: AuthUser | null;
}

const initialState: AuthState = {
  user: null,
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
    },
  },
});

export const { login, logout } = authSlice.actions;
export default authSlice.reducer;

export const selectUser = (state: RootState) => state.auth.user;
export const selectIsAuthenticated = (state: RootState) => !!state.auth.user;
