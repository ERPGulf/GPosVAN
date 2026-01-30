import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

type NavItem = {
    name: string;
    label: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    route: string;
};

const NAV_ITEMS: NavItem[] = [
    { name: 'Home', label: 'Home', icon: 'home-outline', route: '/' },
    { name: 'Customers', label: 'Customers', icon: 'account-group-outline', route: '/customers' },
    { name: 'Pricing', label: 'Pricing', icon: 'tag-outline', route: '/pricing' },
    // { name: 'Orders', label: 'Orders', icon: 'clipboard-text-outline', route: '/orders' },
];

interface SidebarProps {
    onToggle?: () => void;
}

export function Sidebar({ onToggle }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();

    const handlePress = (route: string) => {
        // In a real app we'd navigate to the route
        // router.push(route);
        console.log('Navigating to', route);
    };

    return (
        <View className="flex-col h-full w-[80px] border-r border-gray-200 bg-white py-6 items-center justify-between">
            {/* Top Section */}
            <View className="flex-col w-full items-center gap-8">
                {/* Toggle Button (Replaces Logo) */}
                <Pressable
                    onPress={onToggle}
                    className="items-center justify-center p-2 mb-4 rounded-lg active:bg-gray-100">
                    <MaterialCommunityIcons name="menu-open" size={28} color="#4b5563" />
                </Pressable>

                {/* Navigation Items */}
                <View className="flex-col w-full px-2 gap-4">
                    {NAV_ITEMS.map((item) => {
                        const isActive =
                            pathname === item.route || (item.route !== '/' && pathname.startsWith(item.route));

                        return (
                            <Pressable
                                key={item.name}
                                onPress={() => handlePress(item.route)}
                                className={`flex-col items-center justify-center py-4 px-1 rounded-xl gap-1 ${isActive ? 'bg-green-50' : 'bg-transparent'
                                    }`}>
                                {/* Active Indicator Line (Optional, strictly if needed to match exact pixel perfect design) */}
                                <MaterialCommunityIcons
                                    name={item.icon}
                                    size={24}
                                    color={isActive ? '#22c55e' : '#9ca3af'}
                                />
                                <Text
                                    className={`text-xs font-medium ${isActive ? 'text-green-500' : 'text-gray-400'
                                        }`}>
                                    {item.label}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </View>

            {/* Bottom Actions */}
            <View className="flex-col w-full items-center pb-4">
                <Pressable className="flex-col items-center justify-center p-3 rounded-xl gap-1">
                    <Ionicons name="settings-outline" size={24} color="#9ca3af" />
                </Pressable>
            </View>
        </View>
    );
}
