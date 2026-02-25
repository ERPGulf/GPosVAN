import { pushPendingCustomers, syncAllCustomers } from '@/src/infrastructure/db/customers.repository';
import migrations from '@/src/infrastructure/db/migrations/migrations';
import { syncAllProducts } from '@/src/infrastructure/db/products.repository';
import { persistor, store } from '@/src/store/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Slot } from 'expo-router';
import { openDatabaseSync, SQLiteProvider } from 'expo-sqlite';
import { Suspense, useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import './global.css';


const queryClient = new QueryClient();
const expoDb = openDatabaseSync('van_pos.db', { enableChangeListener: true });
const db = drizzle(expoDb);

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

  // Sync products and customers from API after migrations complete
  useEffect(() => {
    if (success) {
      // First push any offline-created customers, then pull latest data
      pushPendingCustomers(db)
        .then(() => {
          if (__DEV__) {
            console.log('[RootLayout] Pending customers pushed successfully');
          }
        })
        .catch((err) => {
          console.error('[RootLayout] Failed to push pending customers:', err);
        })
        .finally(() => {
          // Pull latest data from API (regardless of push result)
          Promise.all([
            syncAllProducts(db)
              .then(() => {
                if (__DEV__) {
                  console.log('[RootLayout] Products synced successfully');
                }
              })
              .catch((err) => {
                console.error('[RootLayout] Failed to sync products:', err);
              }),
            syncAllCustomers(db)
              .then(() => {
                if (__DEV__) {
                  console.log('[RootLayout] Customers synced successfully');
                }
              })
              .catch((err) => {
                console.error('[RootLayout] Failed to sync customers:', err);
              }),
          ]);
        });
    }
  }, [success]);

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'red' }}>Migration error: {error.message}</Text>
      </View>
    );
  }

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={{ marginTop: 10 }}>Running migrations...</Text>
      </View>
    );
  }


  return (
    <Provider store={store}>
      <PersistGate loading={<ActivityIndicator size="large" color="#22c55e" />} persistor={persistor}>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<ActivityIndicator size="large" color="#22c55e" />}>
            <SQLiteProvider
              databaseName="van_pos.db"
              options={{ enableChangeListener: true }}
              useSuspense
            >
              <SafeAreaView className="flex-1 bg-gray-50">
                <Slot />
              </SafeAreaView>
            </SQLiteProvider>
          </Suspense>
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  );
}

