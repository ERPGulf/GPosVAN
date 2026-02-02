import { useAuth } from '@/context/AuthContext';
import { Redirect, Slot } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Sidebar } from '../../components/Sidebar';
import { TopBar } from '../../components/TopBar';

export default function ProtectedLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarVisible(!isSidebarVisible);
  };

  // Show loading while checking auth status
  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <View className="flex-1 flex-row bg-white">
      {isSidebarVisible && <Sidebar onToggle={toggleSidebar} />}
      <View className="flex-1 flex-col">
        <TopBar onToggleSidebar={toggleSidebar} isSidebarVisible={isSidebarVisible} />
        <View className="flex-1 bg-gray-50">
          <Slot />
        </View>
      </View>
    </View>
  );
}
