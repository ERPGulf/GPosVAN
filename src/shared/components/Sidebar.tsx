import { logout, selectUser } from '@/src/features/auth/authSlice';
import { clearUserTokens } from '@/src/services/api/tokenManager';
import { clearCart } from '@/src/features/cart/cartSlice';
import { selectIsShiftOpen } from '@/src/features/shifts/shiftSlice';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { DrawerContentComponentProps } from '@react-navigation/drawer';
import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

type NavItem = {
  name: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  routeName: string;
  routePath: string;
};

const NAV_ITEMS: NavItem[] = [
  {
    name: 'Dashboard',
    label: 'Dashboard',
    icon: 'view-dashboard-outline',
    routeName: 'index',
    routePath: '/',
  },
  {
    name: 'Customers',
    label: 'Customers',
    icon: 'account-group-outline',
    routeName: 'customers/index',
    routePath: '/customers',
  },
  {
    name: 'SalesReturn',
    label: 'Sales Return',
    icon: 'cash-refund',
    routeName: 'sales-return/index',
    routePath: '/sales-return',
  },
];

interface SidebarProps {
  drawerProps?: DrawerContentComponentProps;
  onToggle?: () => void;
}

export function Sidebar({ drawerProps, onToggle }: SidebarProps) {
  const activeRouteName = drawerProps?.state.routes[drawerProps.state.index]?.name;
  const isSettingsActive = activeRouteName === 'settings/page';
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const isShiftOpen = useAppSelector(selectIsShiftOpen);

  const handlePress = (routeName: string, routePath: string) => {
    if (drawerProps) {
      drawerProps.navigation.navigate(routeName as never);
      drawerProps.navigation.closeDrawer();
    } else {
      router.replace(routePath as any);
    }

    onToggle?.();
  };

  const handleLogout = () => {
    if (isShiftOpen) {
      Alert.alert(
        'Shift is Open',
        'Please close your shift before logging out.',
        [{ text: 'OK' }],
      );
      return;
    }
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await clearUserTokens();
            dispatch(clearCart());
            dispatch(logout());
            router.replace('/login');
          },
        },
      ],
    );
  };

  return (
    <View className="h-full w-[280px] border-r border-gray-200 bg-white px-4 py-5 justify-between">
      <View className="gap-6">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <View className="bg-green-500 rounded-lg p-1.5">
              <MaterialCommunityIcons name="clover" size={20} color="white" />
            </View>
            <Text className="text-lg font-semibold text-gray-800">GPosVan</Text>
          </View>

          {!!onToggle && (
            <Pressable
              onPress={onToggle}
              className="items-center justify-center p-2 rounded-lg active:bg-gray-100">
              <MaterialCommunityIcons name="close" size={20} color="#4b5563" />
            </Pressable>
          )}
        </View>

        <View className="rounded-xl bg-gray-50 border border-gray-100 p-3">
          <Text className="text-xs font-medium text-gray-500 mb-2">Signed in as</Text>
          <Text className="text-sm font-semibold text-gray-800">{user?.email ?? 'Cashier'}</Text>
        </View>

        <View className="gap-2">
          {NAV_ITEMS.map((item) => {
            const isActive = activeRouteName === item.routeName;

            return (
              <Pressable
                key={item.name}
                onPress={() => handlePress(item.routeName, item.routePath)}
                className={`flex-row items-center gap-3 rounded-xl px-3 py-3 ${
                  isActive ? 'bg-green-50 border border-green-100' : 'bg-transparent'
                }`}>
                <MaterialCommunityIcons
                  name={item.icon}
                  size={22}
                  color={isActive ? '#22c55e' : '#6b7280'}
                />
                <Text
                  className={`text-sm font-medium ${isActive ? 'text-green-700' : 'text-gray-700'}`}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View className="gap-2 pb-1">
        <Pressable
          onPress={() => handlePress('settings/page', '/settings/page')}
          className={`flex-row items-center gap-3 rounded-xl px-3 py-3 ${
            isSettingsActive ? 'bg-green-50 border border-green-100' : 'bg-transparent'
          }`}>
          <Ionicons
            name="settings-outline"
            size={22}
            color={isSettingsActive ? '#22c55e' : '#6b7280'}
          />
          <Text
            className={`text-sm font-medium ${
              isSettingsActive ? 'text-green-700' : 'text-gray-700'
            }`}>
            Settings
          </Text>
        </Pressable>

        <Pressable
          onPress={handleLogout}
          className="flex-row items-center gap-3 rounded-xl px-3 py-3 bg-red-50 border border-red-100">
          <Ionicons name="log-out-outline" size={22} color="#dc2626" />
          <Text className="text-sm font-medium text-red-600">Logout</Text>
        </Pressable>
      </View>
    </View>
  );
}
