import migrations from '@/drizzle/migrations';
import { AuthProvider } from '@/src/features/auth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Slot } from 'expo-router';
import { openDatabaseSync, SQLiteProvider } from 'expo-sqlite';
import { Suspense } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import './global.css';

const queryClient = new QueryClient();
const expoDb = openDatabaseSync('van_pos.db', { enableChangeListener: true });
const db = drizzle(expoDb);

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);

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
    <AuthProvider>
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
    </AuthProvider>
  );
}
