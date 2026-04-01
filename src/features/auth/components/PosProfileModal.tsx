import { setPosProfile } from '@/src/features/auth/authSlice';
import { useAppDispatch } from '@/src/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

interface PosProfileModalProps {
  visible: boolean;
  profiles: string[];
}

export function PosProfileModal({ visible, profiles }: PosProfileModalProps) {
  const dispatch = useAppDispatch();
  const [selected, setSelected] = useState<string | null>(null);

  const handleConfirm = () => {
    if (selected) {
      dispatch(setPosProfile(selected));
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View className="flex-1 justify-center items-center bg-black/50 px-6">
        <View className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <View className="bg-green-500 px-6 py-5">
            <Text className="text-white text-xl font-bold">Select POS Profile</Text>
            <Text className="text-green-100 text-sm mt-1">
              Choose the profile you want to use for this session
            </Text>
          </View>

          {/* Profile List */}
          <ScrollView className="max-h-72 px-4 py-3">
            {profiles.map((profile) => {
              const isSelected = selected === profile;
              return (
                <TouchableOpacity
                  key={profile}
                  onPress={() => setSelected(profile)}
                  className={`flex-row items-center px-4 py-4 rounded-xl mb-2 border ${
                    isSelected
                      ? 'bg-green-50 border-green-500'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  {/* Radio indicator */}
                  <View
                    className={`w-6 h-6 rounded-full border-2 items-center justify-center mr-3 ${
                      isSelected ? 'border-green-500' : 'border-gray-300'
                    }`}
                  >
                    {isSelected && (
                      <View className="w-3.5 h-3.5 rounded-full bg-green-500" />
                    )}
                  </View>

                  <Ionicons
                    name="storefront-outline"
                    size={20}
                    color={isSelected ? '#22c55e' : '#6b7280'}
                  />
                  <Text
                    className={`ml-3 text-base font-medium flex-1 ${
                      isSelected ? 'text-green-700' : 'text-gray-700'
                    }`}
                  >
                    {profile}
                  </Text>

                  {isSelected && (
                    <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Confirm Button */}
          <View className="px-6 pb-6 pt-3">
            <TouchableOpacity
              onPress={handleConfirm}
              disabled={!selected}
              className={`w-full py-4 rounded-xl items-center justify-center ${
                selected ? 'bg-green-500' : 'bg-gray-300'
              }`}
            >
              <Text className="text-white font-bold text-base">
                {selected ? 'Confirm Selection' : 'Select a Profile'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
