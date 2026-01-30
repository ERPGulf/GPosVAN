import { Slot } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Sidebar } from '../components/Sidebar';
import { TopBar } from '../components/TopBar';
import './global.css';

export default function RootLayout() {
  const [isSidebarVisible, setIsSidebarVisible] = useState(true);

  const toggleSidebar = () => {
    setIsSidebarVisible(!isSidebarVisible);
  };

  return (
    <SafeAreaView className="flex-1 flex-row bg-gray-50 bg-white">
      {isSidebarVisible && <Sidebar onToggle={toggleSidebar} />}
      <View className="flex-1 flex-col">
        <TopBar onToggleSidebar={toggleSidebar} isSidebarVisible={isSidebarVisible} />
        <View className="flex-1 bg-gray-50">
          <Slot />
        </View>
      </View>
    </SafeAreaView>
  );
}
