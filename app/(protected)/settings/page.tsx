import { selectAppConfig, setAppConfig } from '@/src/features/app/appConfigSlice';
import { fetchPosSettings } from '@/src/features/app/services/posSettings.service';
import { useSyncUsers } from '@/src/features/auth';
import { selectUser } from '@/src/features/auth/authSlice';
import { selectShiftLocalId, setShiftOpeningId } from '@/src/features/shifts/shiftSlice';
import {
    pushPendingCustomers,
    syncAllCustomers,
} from '@/src/infrastructure/db/customers.repository';
import {
    pushErroredInvoices,
    pushPendingInvoices,
} from '@/src/infrastructure/db/invoices.repository';
import {
    pushErroredSalesReturns,
    pushPendingSalesReturns,
} from '@/src/infrastructure/db/salesReturn.repository';
import { syncAllProducts } from '@/src/infrastructure/db/products.repository';
import {
    pushPendingCloseShifts,
    pushPendingOpenShifts,
} from '@/src/infrastructure/db/shifts.repository';
import { clearCredentials, getBranchId, getMachineName } from '@/src/services/credentialStore';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as Network from 'expo-network';
import { openDatabaseSync } from 'expo-sqlite';
import React, { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const expoDb = openDatabaseSync('van_pos.db', { enableChangeListener: true });
const db = drizzle(expoDb);

// ─── Sync status types ────────────────────────────────────────────────
type SyncKey = 'products' | 'customers' | 'users' | 'shiftsAndInvoices' | 'salesReturns';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// ─── Sync Button ──────────────────────────────────────────────────────
function SyncButton({
    icon,
    label,
    status,
    onPress,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    status: SyncStatus;
    onPress: () => void;
}) {
    const isSyncing = status === 'syncing';
    const isSuccess = status === 'success';
    const isError = status === 'error';

    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={isSyncing}
            className={`flex-row items-center rounded-xl px-4 py-3.5 border ${isSyncing
                ? 'border-gray-200 bg-gray-50'
                : isSuccess
                    ? 'border-green-200 bg-green-50'
                    : isError
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-200 bg-white'
                }`}
        >
            {isSyncing ? (
                <ActivityIndicator size="small" color="#22c55e" />
            ) : isSuccess ? (
                <Ionicons name="checkmark-circle" size={22} color="#22c55e" />
            ) : isError ? (
                <Ionicons name="close-circle" size={22} color="#ef4444" />
            ) : (
                <Ionicons name={icon} size={22} color="#6b7280" />
            )}
            <Text
                className={`font-medium text-sm ml-3 flex-1 ${isSyncing
                    ? 'text-gray-400'
                    : isSuccess
                        ? 'text-green-600'
                        : isError
                            ? 'text-red-600'
                            : 'text-gray-700'
                    }`}
            >
                {isSyncing ? `Syncing ${label}...` : label}
            </Text>
            {!isSyncing && (
                <Ionicons name="sync-outline" size={18} color={isSuccess ? '#22c55e' : isError ? '#ef4444' : '#9ca3af'} />
            )}
        </TouchableOpacity>
    );
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
    // ── User profile from Redux ──────────────────────────────────────
    const user = useAppSelector(selectUser);
    const dispatch = useAppDispatch();
    const currentShiftLocalId = useAppSelector(selectShiftLocalId);
    const appConfig = useAppSelector(selectAppConfig);

    // ── Status messages ──────────────────────────────────────────────
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // ── POS Settings refresh state ───────────────────────────────────
    const [isRefreshingSettings, setIsRefreshingSettings] = useState(false);

    // ── Sync state ───────────────────────────────────────────────────
    const [syncStatus, setSyncStatus] = useState<Record<SyncKey, SyncStatus>>({
        products: 'idle',
        customers: 'idle',
        users: 'idle',
        shiftsAndInvoices: 'idle',
        salesReturns: 'idle',
    });
    const { sync: syncUsersFromApi } = useSyncUsers();

    const showSuccess = (message: string) => {
        setSuccessMessage(message);
        setErrorMessage(null);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const showError = (message: string) => {
        setErrorMessage(message);
        setSuccessMessage(null);
        setTimeout(() => setErrorMessage(null), 5000);
    };

    // ── Sync handlers ────────────────────────────────────────────────
    const updateSyncStatus = (key: SyncKey, status: SyncStatus) => {
        setSyncStatus((prev) => ({ ...prev, [key]: status }));
        if (status === 'success' || status === 'error') {
            setTimeout(() => {
                setSyncStatus((prev) => ({ ...prev, [key]: 'idle' }));
            }, 3000);
        }
    };

    const checkInternet = async (): Promise<boolean> => {
        try {
            const state = await Network.getNetworkStateAsync();
            if (!state.isConnected || !state.isInternetReachable) {
                Alert.alert('No Internet', 'Please check your internet connection and try again.');
                return false;
            }
            return true;
        } catch {
            Alert.alert('No Internet', 'Unable to verify network status. Please check your connection.');
            return false;
        }
    };

    const handleSyncProducts = useCallback(async () => {
        if (!(await checkInternet())) return;
        updateSyncStatus('products', 'syncing');
        try {
            await syncAllProducts(db);
            updateSyncStatus('products', 'success');
        } catch (err) {
            console.error('[Settings] Product sync failed:', err);
            updateSyncStatus('products', 'error');
        }
    }, []);

    const handleSyncCustomers = useCallback(async () => {
        if (!(await checkInternet())) return;
        updateSyncStatus('customers', 'syncing');
        try {
            await pushPendingCustomers(db);
            await syncAllCustomers(db);
            updateSyncStatus('customers', 'success');
        } catch (err) {
            console.error('[Settings] Customer sync failed:', err);
            updateSyncStatus('customers', 'error');
        }
    }, []);

    const handleSyncUsers = useCallback(async () => {
        if (!(await checkInternet())) return;
        updateSyncStatus('users', 'syncing');
        try {
            await syncUsersFromApi();
            updateSyncStatus('users', 'success');
        } catch (err) {
            console.error('[Settings] User sync failed:', err);
            updateSyncStatus('users', 'error');
        }
    }, [syncUsersFromApi]);

    const handleSyncShiftsAndInvoices = useCallback(async () => {
        if (!(await checkInternet())) return;
        updateSyncStatus('shiftsAndInvoices', 'syncing');
        try {
            const company = appConfig?.zatca?.company_name || '';
            const posProfile = user?.posProfile?.[0] || '';
            const userEmail = user?.email || '';
            const phase = appConfig?.phase || '1';
            const machineName = await getMachineName() || 'UNKNOWN';
            const userId = user?.id || '';

            // Step 1: Sync open shifts → get shiftOpeningId from server
            console.log('[Settings] Step 1: Syncing open shifts...');
            const syncedShifts = await pushPendingOpenShifts(db, {
                userEmail,
                company,
                posProfile,
            });
            console.log(`[Settings] Open shifts synced: ${syncedShifts.length}`);

            // Update Redux shiftOpeningId if the currently active shift was synced
            if (currentShiftLocalId && syncedShifts.length > 0) {
                const match = syncedShifts.find((s) => s.shiftLocalId === currentShiftLocalId);
                if (match) {
                    dispatch(setShiftOpeningId(match.shiftOpeningId));
                    console.log(`[Settings] Redux shiftOpeningId updated: ${match.shiftOpeningId}`);
                }
            }

            // Determine shiftOpeningId for invoice sync
            const shiftOpeningId = syncedShifts.length > 0
                ? syncedShifts[syncedShifts.length - 1].shiftOpeningId
                : '';

            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Step 2: Sync pending invoices (isSynced=false, isError=false)
            console.log('[Settings] Step 2: Syncing pending invoices...');
            const pendingCount = await pushPendingInvoices(db, {
                posProfile,
                shiftOpeningId,
                phase,
                machineName,
            });
            console.log(`[Settings] Pending invoices synced: ${pendingCount}`);

            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Step 3: Sync errored/uncleared invoices (isError=true, isErrorSynced=false)
            console.log('[Settings] Step 3: Syncing errored invoices...');
            const erroredCount = await pushErroredInvoices(db, {
                posProfile,
                shiftOpeningId,
                phase,
                machineName,
                userId,
            });
            console.log(`[Settings] Errored invoices synced: ${erroredCount}`);

            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Step 4: Sync pending sales returns (isSynced=false, isError=false)
            console.log('[Settings] Step 4: Syncing pending sales returns...');
            const pendingReturns = await pushPendingSalesReturns(db, {
                posProfile,
                shiftOpeningId,
                machineName,
            });
            console.log(`[Settings] Pending sales returns synced: ${pendingReturns}`);

            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Step 5: Sync errored sales returns (isError=true, isErrorSynced=false)
            console.log('[Settings] Step 5: Syncing errored sales returns...');
            const erroredReturns = await pushErroredSalesReturns(db, {
                posProfile,
                shiftOpeningId,
                machineName,
                userId,
            });
            console.log(`[Settings] Errored sales returns synced: ${erroredReturns}`);

            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Step 6: Sync close shifts
            console.log('[Settings] Step 6: Syncing close shifts...');
            const closedShifts = await pushPendingCloseShifts(db, { company });
            console.log(`[Settings] Close shifts synced: ${closedShifts.length}`);

            updateSyncStatus('shiftsAndInvoices', 'success');
        } catch (err) {
            console.error('[Settings] Shifts & invoices sync failed:', err);
            updateSyncStatus('shiftsAndInvoices', 'error');
        }
    }, [user, appConfig, currentShiftLocalId, dispatch]);

    const handleSyncSalesReturns = useCallback(async () => {
        if (!(await checkInternet())) return;
        updateSyncStatus('salesReturns', 'syncing');
        try {
            const posProfile = user?.posProfile?.[0] || '';
            const machineName = await getMachineName() || 'UNKNOWN';
            const userId = user?.id || '';

            // Use the Redux shiftOpeningId if available, otherwise empty string
            const shiftOpeningId = '';

            // Sync pending (unsynced, non-errored) sales returns
            console.log('[Settings] Syncing pending sales returns...');
            const pendingCount = await pushPendingSalesReturns(db, {
                posProfile,
                shiftOpeningId,
                machineName,
            });
            console.log(`[Settings] Pending sales returns synced: ${pendingCount}`);

            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Sync errored sales returns
            console.log('[Settings] Syncing errored sales returns...');
            const erroredCount = await pushErroredSalesReturns(db, {
                posProfile,
                shiftOpeningId,
                machineName,
                userId,
            });
            console.log(`[Settings] Errored sales returns synced: ${erroredCount}`);

            updateSyncStatus('salesReturns', 'success');
        } catch (err) {
            console.error('[Settings] Sales returns sync failed:', err);
            updateSyncStatus('salesReturns', 'error');
        }
    }, [user]);

    const isSyncingAny =
        syncStatus.products === 'syncing' ||
        syncStatus.customers === 'syncing' ||
        syncStatus.users === 'syncing' ||
        syncStatus.shiftsAndInvoices === 'syncing' ||
        syncStatus.salesReturns === 'syncing';

    const handleSyncAll = useCallback(async () => {
        await Promise.all([handleSyncProducts(), handleSyncCustomers(), handleSyncUsers(), handleSyncShiftsAndInvoices(), handleSyncSalesReturns()]);
    }, [handleSyncProducts, handleSyncCustomers, handleSyncUsers, handleSyncShiftsAndInvoices, handleSyncSalesReturns]);

    // ── Refresh POS Settings handler ─────────────────────────────────
    const handleRefreshPosSettings = useCallback(async () => {
        if (!(await checkInternet())) return;
        setIsRefreshingSettings(true);
        try {
            const [machineName, branchId] = await Promise.all([
                getMachineName(),
                getBranchId(),
            ]);

            const posSettings = await fetchPosSettings(
                machineName || '',
                branchId || '',
            );

            dispatch(setAppConfig(posSettings));
            showSuccess('POS settings refreshed successfully!');
            if (__DEV__) {
                console.log('[Settings] POS settings refreshed');
            }
        } catch (err) {
            console.error('[Settings] Failed to refresh POS settings:', err);
            showError('Failed to refresh POS settings. Please try again.');
        } finally {
            setIsRefreshingSettings(false);
        }
    }, [dispatch]);

    // ── Reset handler ────────────────────────────────────────────────
    const handleReset = () => {
        Alert.alert(
            'Reset Configuration',
            'This will delete the current configuration. The app will require a new config upload on next launch. Are you sure?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Reset',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await clearCredentials();
                            showSuccess('Configuration has been reset.');
                            console.log('[Settings] Config cleared');
                        } catch (err) {
                            console.error('[Settings] Reset error:', err);
                            showError('Failed to reset configuration.');
                        }
                    },
                },
            ]
        );
    };

    // ── Render ───────────────────────────────────────────────────────
    return (
        <ScrollView className="flex-1 bg-gray-50">
            <View className="p-6 max-w-2xl self-center w-full">
                {/* Page Header */}
                <Text className="text-2xl font-bold text-gray-800 mb-1">Settings</Text>
                <Text className="text-gray-500 mb-6">
                    Manage your app configuration & data syncing
                </Text>

                {/* Success Message */}
                {successMessage && (
                    <View className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
                        <Text className="text-green-600 text-center font-medium text-sm">
                            ✓ {successMessage}
                        </Text>
                    </View>
                )}

                {/* Error Message */}
                {errorMessage && (
                    <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                        <Text className="text-red-600 text-center font-medium text-sm">
                            {errorMessage}
                        </Text>
                    </View>
                )}

                {/* ═══ BACKGROUND SYNCING SECTION ═══ */}
                <View className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
                    {/* Section Header */}
                    <View className="p-5 border-b border-gray-100">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 bg-purple-100 rounded-xl items-center justify-center mr-3">
                                <Ionicons name="sync-outline" size={22} color="#8b5cf6" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-lg font-semibold text-gray-800">
                                    Background Syncing
                                </Text>
                                <Text className="text-gray-400 text-sm">
                                    Sync data between device and server
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Sync Buttons */}
                    <View className="p-5 gap-3">
                        <SyncButton
                            icon="cube-outline"
                            label="Products"
                            status={syncStatus.products}
                            onPress={handleSyncProducts}
                        />
                        <SyncButton
                            icon="people-outline"
                            label="Customers"
                            status={syncStatus.customers}
                            onPress={handleSyncCustomers}
                        />
                        <SyncButton
                            icon="person-outline"
                            label="Users"
                            status={syncStatus.users}
                            onPress={handleSyncUsers}
                        />
                        <SyncButton
                            icon="receipt-outline"
                            label="Shifts & Invoices"
                            status={syncStatus.shiftsAndInvoices}
                            onPress={handleSyncShiftsAndInvoices}
                        />
                        <SyncButton
                            icon="return-down-back-outline"
                            label="Sales Returns"
                            status={syncStatus.salesReturns}
                            onPress={handleSyncSalesReturns}
                        />

                        {/* Sync All */}
                        <TouchableOpacity
                            onPress={handleSyncAll}
                            disabled={isSyncingAny}
                            className={`flex-row items-center justify-center rounded-xl px-5 py-4 mt-1 ${isSyncingAny
                                ? 'bg-purple-300'
                                : 'bg-purple-500'
                                }`}
                        >
                            {isSyncingAny ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Ionicons name="cloud-download-outline" size={22} color="white" />
                            )}
                            <Text className="text-white font-semibold text-base ml-3">
                                {isSyncingAny ? 'Syncing All...' : 'Sync All Data'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ═══ POS SETTINGS SECTION ═══ */}
                <View className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
                    {/* Section Header */}
                    <View className="p-5 border-b border-gray-100">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 bg-green-100 rounded-xl items-center justify-center mr-3">
                                <Ionicons name="settings-outline" size={22} color="#22c55e" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-lg font-semibold text-gray-800">
                                    POS Settings
                                </Text>
                                <Text className="text-gray-400 text-sm">
                                    {appConfig ? 'Settings loaded from server' : 'No settings loaded'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Config Info */}
                    {appConfig && (
                        <View className="px-5 pt-4 pb-2">
                            <View className="bg-gray-50 rounded-xl p-3 gap-1">
                                {appConfig.zatca?.company_name && (
                                    <Text className="text-gray-600 text-sm">
                                        <Text className="font-medium">Company: </Text>
                                        {appConfig.zatca.company_name}
                                    </Text>
                                )}
                                {appConfig.phase && (
                                    <Text className="text-gray-600 text-sm">
                                        <Text className="font-medium">Phase: </Text>
                                        {appConfig.phase}
                                    </Text>
                                )}
                                {appConfig.prefix && (
                                    <Text className="text-gray-600 text-sm">
                                        <Text className="font-medium">Invoice Prefix: </Text>
                                        {appConfig.prefix}
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Actions */}
                    <View className="p-5">
                        {/* Refresh POS Settings */}
                        <TouchableOpacity
                            onPress={handleRefreshPosSettings}
                            disabled={isRefreshingSettings}
                            className={`flex-row items-center justify-center rounded-xl px-5 py-4 ${isRefreshingSettings
                                ? 'bg-green-400'
                                : 'bg-green-500'
                                }`}
                        >
                            {isRefreshingSettings ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Ionicons name="refresh-outline" size={22} color="white" />
                            )}
                            <Text className="text-white font-semibold text-base ml-3">
                                {isRefreshingSettings ? 'Refreshing...' : 'Refresh POS Settings'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ═══ DANGER ZONE ═══ */}
                <View className="bg-white rounded-2xl shadow-sm border border-red-100 mb-8">
                    <View className="p-5 border-b border-red-50">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 bg-red-100 rounded-xl items-center justify-center mr-3">
                                <Ionicons name="warning-outline" size={22} color="#ef4444" />
                            </View>
                            <View>
                                <Text className="text-lg font-semibold text-gray-800">
                                    Danger Zone
                                </Text>
                                <Text className="text-gray-400 text-sm">Irreversible actions</Text>
                            </View>
                        </View>
                    </View>

                    <View className="p-5">
                        <TouchableOpacity
                            onPress={handleReset}
                            className="flex-row items-center bg-red-50 border border-red-200 rounded-xl px-5 py-4">
                            <Ionicons name="trash-outline" size={22} color="#ef4444" />
                            <View className="ml-3 flex-1">
                                <Text className="text-red-600 font-semibold text-base">
                                    Reset Configuration
                                </Text>
                                <Text className="text-red-400 text-xs mt-0.5">
                                    Deletes credentials and requires re-upload on next launch
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </ScrollView>
    );
}
