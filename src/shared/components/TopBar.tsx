import { logout, selectSelectedPosProfile, selectUser } from '@/src/features/auth/authSlice';
import { CloseShiftModal } from '@/src/features/shifts/components/CloseShiftModal';
import { OpenShiftModal } from '@/src/features/shifts/components/OpenShiftModal';
import { buildBalanceDetails, formatDateForApi, syncOpenShiftToServer } from '@/src/features/shifts/services/shiftApi.service';
import { closeShiftState, openShiftState, selectIsShiftOpen, selectShiftLocalId, setShiftOpeningId } from '@/src/features/shifts/shiftSlice';
import { closeShift, markShiftOpeningSynced, openShift } from '@/src/infrastructure/db/shifts.repository';
import { getAppConfig } from '@/src/services/configStore';
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
  const isShiftOpen = useAppSelector(selectIsShiftOpen);
  const shiftLocalId = useAppSelector(selectShiftLocalId);
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showOpenShiftModal, setShowOpenShiftModal] = useState(false);
  const [showCloseShiftModal, setShowCloseShiftModal] = useState(false);

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

              {!isShiftOpen ? (
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
              ) : (
                <TouchableOpacity
                  className="flex-row items-center py-2"
                  onPress={() => {
                    setShowUserMenu(false);
                    setShowCloseShiftModal(true);
                  }}
                >
                  <MaterialCommunityIcons name="store-off-outline" size={20} color="#4b5563" />
                  <Text className="ml-3 text-gray-700 font-medium text-base">Close Shift</Text>
                </TouchableOpacity>
              )}

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
              branch: selectedPosProfile || undefined,
            });
            dispatch(openShiftState(shiftLocalId));
            if (__DEV__) {
              console.log('[TopBar] Shift opened locally:', shiftLocalId);
            }
            setShowOpenShiftModal(false);

            // Fire-and-forget: attempt immediate sync with server
            (async () => {
              try {
                const appConfig = await getAppConfig();
                const company = appConfig?.zatca?.company_name || '';
                const posProfile = selectedPosProfile || '';
                const userEmail = user?.email || '';

                const syncId = await syncOpenShiftToServer({
                  name: shiftLocalId,
                  period_start_date: formatDateForApi(new Date()),
                  company,
                  user: userEmail,
                  pos_profile: posProfile,
                  balance_details: buildBalanceDetails(cash),
                });

                // Update local DB and Redux with server sync_id
                await markShiftOpeningSynced(db, shiftLocalId, syncId);
                dispatch(setShiftOpeningId(syncId));

                if (__DEV__) {
                  console.log('[TopBar] Shift synced with server, sync_id:', syncId);
                }
              } catch (syncErr) {
                // Sync failed (offline or error) — will be retried on next app launch
                if (__DEV__) {
                  console.log('[TopBar] Shift sync failed, will retry later:', syncErr);
                }
              }
            })();
          } catch (err) {
            console.error('[TopBar] Failed to open shift:', err);
            Alert.alert('Error', 'Failed to open shift. Please try again.');
          }
        }}
      />

      {/* Close Shift Modal */}
      <CloseShiftModal
        visible={showCloseShiftModal}
        onClose={() => setShowCloseShiftModal(false)}
        onSubmit={async (cash, card) => {
          if (!shiftLocalId) {
            Alert.alert('Error', 'No active shift found.');
            return;
          }
          try {
            await closeShift(db, {
              shiftLocalId,
              closingCash: cash,
              closingCard: card,
            });

            dispatch(closeShiftState());
            setShowCloseShiftModal(false);

            if (__DEV__) {
              console.log('[TopBar] Shift closed successfully:', shiftLocalId);
            }
          } catch (err) {
            console.error('[TopBar] Failed to close shift:', err);
            Alert.alert('Error', 'Failed to close shift. Please try again.');
          }
        }}
      />
    </View>
  );
}
