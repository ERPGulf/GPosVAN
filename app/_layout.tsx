import { AuthProvider } from '@/context/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Slot } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense } from 'react';
import { ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import './global.css';

const queryClient = new QueryClient();

export default function RootLayout() {


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
