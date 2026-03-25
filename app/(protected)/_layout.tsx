import { selectIsAuthenticated } from '@/src/features/auth/authSlice';
import { Sidebar } from '@/src/shared/components/Sidebar';
import { TopBar } from '@/src/shared/components/TopBar';
import { useAppSelector } from '@/src/store/hooks';
import { DrawerActions } from '@react-navigation/native';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { View, useWindowDimensions } from 'react-native';

export default function ProtectedLayout() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <View className="flex-1 bg-white">
      <Drawer
        defaultStatus={isDesktop ? 'open' : 'closed'}
        drawerContent={(props) => (
          <Sidebar
            drawerProps={props}
            onToggle={() => props.navigation.dispatch(DrawerActions.toggleDrawer())}
          />
        )}
        screenOptions={({ navigation }) => ({
          header: () => (
            <TopBar
              showMenuButton
              onMenuPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
            />
          ),
          drawerType: isDesktop ? 'slide' : 'front',
          swipeEnabled: true,
          overlayColor: isDesktop ? 'transparent' : 'rgba(0,0,0,0.25)',
          sceneStyle: { backgroundColor: '#f9fafb' },
          drawerStyle: {
            width: isDesktop ? 280 : 300,
            backgroundColor: '#ffffff',
          },
        })}>
        <Drawer.Screen name="index" options={{ title: 'Dashboard' }} />
        <Drawer.Screen name="customers/index" options={{ title: 'Customers' }} />
        <Drawer.Screen name="checkout/index" options={{ title: 'Checkout' }} />
        <Drawer.Screen name="settings/page" options={{ title: 'Settings' }} />
      </Drawer>
    </View>
  );
}
