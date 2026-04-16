import SetupScreen from '@/app/setup';
import migrations from '@/src/infrastructure/db/migrations/migrations';
import { isConfigured } from '@/src/services/credentialStore';
import { persistor, store } from '@/src/store/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Slot } from 'expo-router';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
import { openDatabaseSync, SQLiteProvider } from 'expo-sqlite';
import { Suspense, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import './global.css';

import { UserSyncGate } from '@/src/features/auth/components/UserSyncGate';

const queryClient = new QueryClient();
const expoDb = openDatabaseSync('van_pos.db', { enableChangeListener: true });
const db = drizzle(expoDb);

export default function RootLayout() {
  useDrizzleStudio(expoDb);
  const { success, error } = useMigrations(db, migrations);
  const [configChecked, setConfigChecked] = useState<boolean | null>(null);

  // Check if app has been configured (first launch detection)
  useEffect(() => {
    isConfigured().then(setConfigChecked);
  }, []);

  // Still checking secure store
  if (configChecked === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  // Not configured — show setup screen inline (no redirect)
  if (!configChecked) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <SetupScreen onConfigured={() => setConfigChecked(true)} />
      </SafeAreaView>
    );
  }

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
              <UserSyncGate>
                <SafeAreaView className="flex-1 bg-gray-50">
                  <Slot />
                </SafeAreaView>
              </UserSyncGate>
            </SQLiteProvider>
          </Suspense>
        </QueryClientProvider>
      </PersistGate>
    </Provider>
  );
}
