import { logout, selectSelectedPosProfile, selectUser } from '@/src/features/auth/authSlice';
import { OpenShiftModal } from '@/src/features/shifts/components/OpenShiftModal';
import { openShiftState } from '@/src/features/shifts/shiftSlice';
import { openShift } from '@/src/infrastructure/db/shifts.repository';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useState } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';

interface TopBarProps {
  onMenuPress?: () => void;
  showMenuButton?: boolean;
}

export function TopBar({ onMenuPress, showMenuButton = true }: TopBarProps) {
  const sqliteDb = useSQLiteContext();
  const db = drizzle(sqliteDb);
  const user = useAppSelector(selectUser);
  const selectedPosProfile = useAppSelector(selectSelectedPosProfile);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);

  // Extract initials
  const getInitials = (name?: string | null) => {
    if (!name) return 'U';
    return name.substring(0, 2).toUpperCase();
  };
  const initials = getInitials(user?.username || user?.email);

  return (
    <View className="flex-row w-full h-16 bg-white border-b border-gray-200 px-6 items-center justify-between z-50">
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

      <View className="flex-row items-center gap-4 z-50">
        {selectedPosProfile && (
          <View className="flex-row items-center bg-gray-50 px-3 py-1.5 rounded border border-gray-200">
            <MaterialCommunityIcons name="storefront-outline" size={16} color="#4b5563" />
            <Text className="text-gray-700 font-medium text-sm ml-1.5">{selectedPosProfile}</Text>
          </View>
        )}

        <View className="relative z-50">
          <TouchableOpacity
            onPress={() => setShowUserMenu(!showUserMenu)}
            className="w-10 h-10 rounded-full bg-gray-200 items-center justify-center border border-gray-300"
          >
            <Text className="text-gray-600 font-bold">{initials}</Text>
          </TouchableOpacity>

          {showUserMenu && (
            <View
              className="absolute top-14 right-0 bg-white rounded-xl border border-gray-200 p-4 min-w-[200px]"
              style={{ elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 8 }}
            >
              <Text className="text-gray-800 font-bold text-base mb-1" numberOfLines={1}>
                {user?.username || user?.email || 'User'}
              </Text>
              {user?.email && user?.username && (
                <Text className="text-gray-500 text-xs" numberOfLines={1}>{user.email}</Text>
              )}

              <View className="h-px bg-gray-200 my-3" />

              <TouchableOpacity
                className="flex-row items-center py-2"
                onPress={() => {
                  setShowUserMenu(false);
                  router.push('/settings/page');
                }}
              >
                <MaterialCommunityIcons name="cog-outline" size={20} color="#4b5563" />
                <Text className="ml-3 text-gray-700 font-medium text-base">Settings</Text>
              </TouchableOpacity>

              <TouchableOpacity
                className="flex-row items-center py-2"
                onPress={() => {
                  setShowUserMenu(false);
                  setShowOpenShiftModal(true);
                }}
              >
                <MaterialCommunityIcons name="store-clock-outline" size={20} color="#4b5563" />
                <Text className="ml-3 text-gray-700 font-medium text-base">Open Shift</Text>
              </TouchableOpacity>

              <View className="h-px bg-gray-200 my-1" />

              <TouchableOpacity
                className="flex-row items-center py-2 mt-1"
                onPress={() => {
                  setShowUserMenu(false);
                  dispatch(logout());
                }}
              >
                <MaterialCommunityIcons name="logout" size={20} color="#ef4444" />
                <Text className="ml-3 text-red-500 font-medium text-base">Logout</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Open Shift Modal */}
      <OpenShiftModal
        visible={showOpenShiftModal}
        onClose={() => setShowOpenShiftModal(false)}
        onSubmit={async (cash) => {
          try {
            const shiftLocalId = await openShift(db, {
              userId: user?.id || '',
              username: user?.username || user?.email || 'unknown',
              openingCash: cash,
            });
            dispatch(openShiftState(shiftLocalId));
            if (__DEV__) {
              console.log('[TopBar] Shift opened:', shiftLocalId);
            }
            setShowOpenShiftModal(false);
          } catch (err) {
            console.error('[TopBar] Failed to open shift:', err);
            Alert.alert('Error', 'Failed to open shift. Please try again.');
          }
        }}
      />
    </View>
  );
}
