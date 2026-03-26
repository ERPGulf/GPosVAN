import { useUsers } from '@/src/features/auth';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

interface UserSyncGateProps {
  children: React.ReactNode;
}

/**
 * Gate component that syncs offline users from the API before rendering children.
 * Must be placed inside SQLiteProvider and QueryClientProvider.
 * The offline users API does not require authentication.
 */
export function UserSyncGate({ children }: UserSyncGateProps) {
  const { isLoading: isSyncingUsers } = useUsers();

  if (isSyncingUsers) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#22c55e" />
        <Text style={{ marginTop: 10, color: '#6b7280' }}>Syncing users...</Text>
      </View>
    );
  }

  return <>{children}</>;
}
