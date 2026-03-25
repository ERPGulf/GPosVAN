import { MaterialCommunityIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface TopBarProps {
  onMenuPress?: () => void;
  showMenuButton?: boolean;
}

export function TopBar({ onMenuPress, showMenuButton = true }: TopBarProps) {
  return (
    <View className="flex-row w-full h-16 bg-white border-b border-gray-200 px-6 items-center justify-between">
      <View className="flex-row items-center gap-4">
        {showMenuButton && (
          <TouchableOpacity onPress={onMenuPress} className="p-1">
            <MaterialCommunityIcons name="menu" size={28} color="#4b5563" />
          </TouchableOpacity>
        )}

        <View className="flex-row items-center gap-2">
          <View className="bg-green-500 rounded-lg p-1.5">
            <MaterialCommunityIcons name="clover" size={20} color="white" />
          </View>
          <Text className="text-xl font-bold text-gray-800">GPosVan</Text>
        </View>
      </View>

      <View className="flex-row items-center gap-4">
        <View className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center">
          <Text className="text-gray-600 font-medium">WS</Text>
        </View>
      </View>
    </View>
  );
}
