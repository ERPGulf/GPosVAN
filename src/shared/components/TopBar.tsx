import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface TopBarProps {
    onToggleSidebar?: () => void;
    isSidebarVisible?: boolean;
}

export function TopBar({ onToggleSidebar, isSidebarVisible }: TopBarProps) {
    return (
        <View className="flex-row w-full h-16 bg-white border-b border-gray-200 px-6 items-center justify-between">
            {/* Title / Logo Area */}
            <View className="flex-row items-center gap-4">
                {!isSidebarVisible && (
                    <TouchableOpacity onPress={onToggleSidebar} className="p-1">
                        <MaterialCommunityIcons name="menu" size={28} color="#4b5563" />
                    </TouchableOpacity>
                )}

                {/* Logo */}
                <View className="flex-row items-center gap-2">
                    <View className="bg-green-500 rounded-lg p-1.5">
                        <MaterialCommunityIcons name="clover" size={20} color="white" />
                    </View>
                    <Text className="text-xl font-bold text-gray-800">GPosVan</Text>
                </View>

                {/* Divider
                <View className="w-[1px] h-6 bg-gray-300 mx-2" />

                <Text className="text-lg font-semibold text-gray-600">Items</Text> */}
            </View>

            {/* User Profile / Actions */}
            <View className="flex-row items-center gap-4">
                {/* Placeholder for potential other top bar items if needed later */}

                {/* Avatar */}
                <View className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center">
                    <Text className="text-gray-600 font-medium">WS</Text>
                </View>
            </View>
        </View>
    );
}
