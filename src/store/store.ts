import appConfigReducer from '@/src/features/app/appConfigSlice';
import authReducer from '@/src/features/auth/authSlice';
import cartReducer from '@/src/features/cart/cartSlice';
import loyaltyReducer from '@/src/features/loyalty/loyaltySlice';
import salesReturnReducer from '@/src/features/sales-return/salesReturnSlice';
import shiftReducer from '@/src/features/shifts/shiftSlice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistReducer, persistStore } from 'redux-persist';

// Persist Config
const authPersistConfig = {
  key: 'auth',
  storage: AsyncStorage,
  whitelist: ['user', 'selectedPosProfile'], // persist user and selected POS profile
};

const shiftPersistConfig = {
  key: 'shift',
  storage: AsyncStorage,
  whitelist: ['shiftLocalId', 'shiftOpeningId', 'isShiftOpen'], // persist shift state across app restarts
};

const appConfigPersistConfig = {
  key: 'appConfig',
  storage: AsyncStorage,
  whitelist: ['config', 'isLoaded'], // persist pos_settings for offline availability
};

// Root Reducer
const rootReducer = combineReducers({
  auth: persistReducer(authPersistConfig, authReducer),
  shift: persistReducer(shiftPersistConfig, shiftReducer),
  appConfig: persistReducer(appConfigPersistConfig, appConfigReducer),
  cart: cartReducer, // cart stays in-memory only (clears on app restart)
  loyalty: loyaltyReducer, // loyalty stays in-memory only (clears on app restart)
  salesReturn: salesReturnReducer, // sales return stays in-memory only (clears on app restart)
});

// Store
export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore redux-persist actions for serializable check
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
