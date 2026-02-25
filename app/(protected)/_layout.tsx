import { selectIsAuthenticated } from '@/src/features/auth/authSlice';
import { Sidebar } from '@/src/shared/components/Sidebar';
import { TopBar } from '@/src/shared/components/TopBar';
import { useAppSelector } from '@/src/store/hooks';
import { Redirect, Slot } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

export default function ProtectedLayout() {
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const [isSidebarVisible, setIsSidebarVisible] = useState(true);

    const toggleSidebar = () => {
        setIsSidebarVisible(!isSidebarVisible);
    };

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
