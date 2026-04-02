import { pushPendingCustomers, syncAllCustomers } from '@/src/infrastructure/db/customers.repository';
import { syncAllProducts } from '@/src/infrastructure/db/products.repository';
import { pushPendingOpenShifts } from '@/src/infrastructure/db/shifts.repository';
import { selectIsAuthenticated, selectUser, selectSelectedPosProfile, setPosProfile } from '@/src/features/auth/authSlice';
import { selectShiftLocalId, setShiftOpeningId } from '@/src/features/shifts/shiftSlice';
import { PosProfileModal } from '@/src/features/auth/components/PosProfileModal';
import { Sidebar } from '@/src/shared/components/Sidebar';
import { TopBar } from '@/src/shared/components/TopBar';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { DrawerActions } from '@react-navigation/native';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { Redirect } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import { openDatabaseSync } from 'expo-sqlite';
import { useEffect, useRef } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { getAppConfig } from '@/src/services/configStore';

const expoDb = openDatabaseSync('van_pos.db', { enableChangeListener: true });
const db = drizzle(expoDb);

export default function ProtectedLayout() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const user = useAppSelector(selectUser);
  const selectedPosProfile = useAppSelector(selectSelectedPosProfile);
  const currentShiftLocalId = useAppSelector(selectShiftLocalId);
  const dispatch = useAppDispatch();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1024;
  const hasSynced = useRef(false);

  const posProfiles = user?.posProfile ?? [];
  const needsProfileSelection = posProfiles.length > 1 && !selectedPosProfile;

  // Auto-select if exactly one POS profile
  useEffect(() => {
    if (posProfiles.length === 1 && !selectedPosProfile) {
      dispatch(setPosProfile(posProfiles[0]));
    }
  }, [posProfiles, selectedPosProfile, dispatch]);

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Redirect href="/login" />;
  }

  // Sync products and customers after login (uses user token via apiClient)
  useEffect(() => {
    if (!hasSynced.current) {
      hasSynced.current = true;

      // First push any offline-created customers and pending shifts, then pull latest data
      Promise.all([
        pushPendingCustomers(db)
          .then(() => {
            if (__DEV__) {
              console.log('[ProtectedLayout] Pending customers pushed successfully');
            }
          })
          .catch((err) => {
            console.error('[ProtectedLayout] Failed to push pending customers:', err);
          }),
        // Push pending open shifts
        (async () => {
          try {
            const appConfig = await getAppConfig();
            const company = appConfig?.zatca?.company_name || '';
            const posProfile = selectedPosProfile || '';
            const userEmail = user?.email || '';

            const synced = await pushPendingOpenShifts(db, {
              userEmail,
              company,
              posProfile,
            });

            // If the currently active shift was synced, update Redux
            if (currentShiftLocalId) {
              const match = synced.find((s) => s.shiftLocalId === currentShiftLocalId);
              if (match) {
                dispatch(setShiftOpeningId(match.shiftOpeningId));
              }
            }

            if (__DEV__) {
              console.log('[ProtectedLayout] Pending open shifts pushed successfully');
            }
          } catch (err) {
            console.error('[ProtectedLayout] Failed to push pending open shifts:', err);
          }
        })(),
      ]).finally(() => {
        // Pull latest data from API (regardless of push result)
        Promise.all([
          syncAllProducts(db)
            .then(() => {
              if (__DEV__) {
                console.log('[ProtectedLayout] Products synced successfully');
              }
            })
            .catch((err) => {
              console.error('[ProtectedLayout] Failed to sync products:', err);
            }),
          syncAllCustomers(db)
            .then(() => {
              if (__DEV__) {
                console.log('[ProtectedLayout] Customers synced successfully');
              }
            })
            .catch((err) => {
              console.error('[ProtectedLayout] Failed to sync customers:', err);
            }),
        ]);
      });
    }
  }, []);

  return (
    <View className="flex-1 bg-white">
      {/* POS Profile Selection Modal */}
      <PosProfileModal visible={needsProfileSelection} profiles={posProfiles} />
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
