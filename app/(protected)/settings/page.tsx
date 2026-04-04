import type { AppConfig } from '@/src/features/app/types';
import { useSyncUsers } from '@/src/features/auth';
import { selectUser } from '@/src/features/auth/authSlice';
import {
    pushPendingCustomers,
    syncAllCustomers,
} from '@/src/infrastructure/db/customers.repository';
import {
    pushErroredInvoices,
    pushPendingInvoices,
} from '@/src/infrastructure/db/invoices.repository';
import { syncAllProducts } from '@/src/infrastructure/db/products.repository';
import {
    pushPendingCloseShifts,
    pushPendingOpenShifts,
} from '@/src/infrastructure/db/shifts.repository';
import {
    clearAppConfig,
    getAppConfig,
    saveAppConfig,
} from '@/src/services/configStore';
import { selectShiftLocalId, setShiftOpeningId } from '@/src/features/shifts/shiftSlice';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as Network from 'expo-network';
import { openDatabaseSync } from 'expo-sqlite';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

const expoDb = openDatabaseSync('van_pos.db', { enableChangeListener: true });
const db = drizzle(expoDb);

/**
 * Minimal validation for AppConfig shape.
 */
function validateAppConfig(data: unknown): data is AppConfig {
    if (typeof data !== 'object' || data === null) return false;
    const obj = data as Record<string, unknown>;

    const requiredKeys: (keyof AppConfig)[] = [
        'discount_field',
        'prefix',
        'item_code_total_digits',
        'item_code_starting_position',
        'weight_starting_position',
        'weight_total_digitsexcluding_decimal',
        'no_of_decimal_in_weights',
        'price_included_in_barcode_or_not',
        'price_starting_position',
        'price_total_digitsexcluding_decimals',
        'no_of_decimal_in_price',
        'inclusive',
        'tax_percentage',
        'phase',
        'zatca',
        'cardpay_settings',
        'branch_details',
    ];

    for (const key of requiredKeys) {
        if (!(key in obj)) return false;
    }

    if (typeof obj.zatca !== 'object' || obj.zatca === null) return false;
    if (typeof obj.cardpay_settings !== 'object' || obj.cardpay_settings === null) return false;
    if (typeof obj.branch_details !== 'object' || obj.branch_details === null) return false;

    return true;
}

async function processConfigJson(content: string): Promise<string | null> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
        console.log('[Settings] JSON parsed successfully');
    } catch {
        return 'Invalid JSON. Please check the format.';
    }

    if (!validateAppConfig(parsed)) {
        return 'Invalid configuration. The JSON is missing required fields.';
    }

    console.log('[Settings] Validation passed, saving config...');
    await saveAppConfig(parsed);
    console.log('[Settings] Config saved successfully');
    return null;
}

// ─── Sync status types ────────────────────────────────────────────────
type SyncKey = 'products' | 'customers' | 'users' | 'shiftsAndInvoices';
type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

// ─── User Profile Detail Row ──────────────────────────────────────────
function ProfileRow({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
    return (
        <View className="flex-row items-center py-3 border-b border-gray-50">
            <View className="w-9 h-9 bg-gray-50 rounded-lg items-center justify-center mr-3">
                <Ionicons name={icon} size={18} color="#6b7280" />
            </View>
            <View className="flex-1">
                <Text className="text-xs text-gray-400 uppercase tracking-wider">{label}</Text>
                <Text className="text-base text-gray-800 mt-0.5">{value}</Text>
            </View>
        </View>
    );
}

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

    // ── App config state ─────────────────────────────────────────────
    const [currentConfig, setCurrentConfig] = useState<AppConfig | null>(null);
    const [isLoadingConfig, setIsLoadingConfig] = useState(true);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Edit modal state
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [editJson, setEditJson] = useState('');
    const [editError, setEditError] = useState<string | null>(null);
    const [editLoading, setEditLoading] = useState(false);

    // Upload state
    const [uploading, setUploading] = useState(false);

    // ── Sync state ───────────────────────────────────────────────────
    const [syncStatus, setSyncStatus] = useState<Record<SyncKey, SyncStatus>>({
        products: 'idle',
        customers: 'idle',
        users: 'idle',
        shiftsAndInvoices: 'idle',
    });
    const { sync: syncUsersFromApi } = useSyncUsers();

    // Load current config
    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setIsLoadingConfig(true);
        try {
            const config = await getAppConfig();
            setCurrentConfig(config);
            console.log('[Settings] Current config loaded');
        } catch (err) {
            console.error('[Settings] Failed to load config:', err);
        } finally {
            setIsLoadingConfig(false);
        }
    };

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
            const appConfig = await getAppConfig();
            const company = appConfig?.zatca?.company_name || '';
            const posProfile = user?.posProfile?.[0] || '';
            const userEmail = user?.email || '';
            const phase = appConfig?.phase || '1';
            const machineName = process.env.EXPO_PUBLIC_MACHINE_NAME || 'UNKNOWN';
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
            // Use the most recently synced shift, or fall back to the first synced one
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

            // Step 4: Sync close shifts
            console.log('[Settings] Step 4: Syncing close shifts...');
            const closedShifts = await pushPendingCloseShifts(db, { company });
            console.log(`[Settings] Close shifts synced: ${closedShifts.length}`);

            updateSyncStatus('shiftsAndInvoices', 'success');
        } catch (err) {
            console.error('[Settings] Shifts & invoices sync failed:', err);
            updateSyncStatus('shiftsAndInvoices', 'error');
        }
    }, [user]);

    const isSyncingAny =
        syncStatus.products === 'syncing' ||
        syncStatus.customers === 'syncing' ||
        syncStatus.users === 'syncing' ||
        syncStatus.shiftsAndInvoices === 'syncing';

    const handleSyncAll = useCallback(async () => {
        await Promise.all([handleSyncProducts(), handleSyncCustomers(), handleSyncUsers(), handleSyncShiftsAndInvoices()]);
    }, [handleSyncProducts, handleSyncCustomers, handleSyncUsers, handleSyncShiftsAndInvoices]);

    // ── Config handlers (preserved from original) ────────────────────
    const handleReupload = async () => {
        try {
            setUploading(true);
            setErrorMessage(null);

            console.log('[Settings] Opening document picker for re-upload...');
            const result = await DocumentPicker.getDocumentAsync({
                type: '*/*',
                copyToCacheDirectory: true,
            });

            if (result.canceled) {
                setUploading(false);
                return;
            }

            const file = result.assets[0];
            console.log(`[Settings] File selected: ${file.name}`);

            if (!file.name.toLowerCase().endsWith('.json')) {
                showError('Please select a .json file.');
                setUploading(false);
                return;
            }

            const fileObj = new File(file.uri);
            const content = fileObj.textSync();
            console.log(`[Settings] File read (${content.length} chars)`);

            const error = await processConfigJson(content);
            if (error) {
                showError(error);
                setUploading(false);
                return;
            }

            await loadConfig();
            showSuccess('Configuration updated successfully!');
        } catch (err) {
            console.error('[Settings] Re-upload error:', err);
            showError(err instanceof Error ? err.message : 'An unexpected error occurred.');
        } finally {
            setUploading(false);
        }
    };

    const openEditModal = () => {
        if (currentConfig) {
            setEditJson(JSON.stringify(currentConfig, null, 2));
        } else {
            setEditJson('');
        }
        setEditError(null);
        setEditModalVisible(true);
    };

    const handleEditSave = async () => {
        if (!editJson.trim()) {
            setEditError('JSON cannot be empty.');
            return;
        }

        setEditLoading(true);
        setEditError(null);

        try {
            const error = await processConfigJson(editJson.trim());
            if (error) {
                setEditError(error);
                setEditLoading(false);
                return;
            }

            setEditLoading(false);
            setEditModalVisible(false);
            await loadConfig();
            showSuccess('Configuration updated successfully!');
        } catch (err) {
            console.error('[Settings] Edit save error:', err);
            setEditError(err instanceof Error ? err.message : 'An unexpected error occurred.');
            setEditLoading(false);
        }
    };

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
                            await clearAppConfig();
                            setCurrentConfig(null);
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

    // ── Loading state ────────────────────────────────────────────────
    if (isLoadingConfig) {
        return (
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color="#22c55e" />
                <Text className="mt-4 text-gray-500">Loading settings...</Text>
            </View>
        );
    }

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

                {/* ═══ 1. USER PROFILE SECTION ═══ */}
                {/* 
                <View className="p-5 border-b border-gray-100">
                    <View className="flex-row items-center">
                        <View className="w-10 h-10 bg-blue-100 rounded-xl items-center justify-center mr-3">
                            <Ionicons name="person-outline" size={22} color="#3b82f6" />
                        </View>
                        <View className="flex-1">
                            <Text className="text-lg font-semibold text-gray-800">
                                User Profile
                            </Text>
                            <Text className="text-gray-400 text-sm">
                                {user ? (user.cashierName || user.username || 'Logged in') : 'No user logged in'}
                            </Text>
                        </View>
                    </View>
                </View>

                <View className="px-5 pb-4">
                    {user ? (
                        <>
                            {(user.cashierName || user.username) && (
                                <ProfileRow
                                    icon="person-circle-outline"
                                    label="Name"
                                    value={user.cashierName || user.username || '—'}
                                />
                            )}
                            {user.email && (
                                <ProfileRow
                                    icon="mail-outline"
                                    label="Email"
                                    value={user.email}
                                />
                            )}
                            {user.shopName && (
                                <ProfileRow
                                    icon="storefront-outline"
                                    label="Shop Name"
                                    value={user.shopName}
                                />
                            )}
                            {user.address && (
                                <ProfileRow
                                    icon="location-outline"
                                    label="Address"
                                    value={user.address}
                                />
                            )}
                            <ProfileRow
                                icon="shield-checkmark-outline"
                                label="Role"
                                value={user.isAdmin ? 'Administrator' : 'Cashier'}
                            />
                            {user.posProfile && user.posProfile.length > 0 && (
                                <ProfileRow
                                    icon="briefcase-outline"
                                    label="POS Profile"
                                    value={user.posProfile.join(', ')}
                                />
                            )}
                        </>
                    ) : (
                        <View className="py-6 items-center">
                            <Ionicons name="person-outline" size={40} color="#d1d5db" />
                            <Text className="text-gray-400 mt-2 text-sm">No user data available</Text>
                        </View>
                    )}
                </View>
                */}
                {/* ═══ 3. BACKGROUND SYNCING SECTION ═══ */}
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

                {/* ═══ 2. APP CONFIGURATION SECTION ═══ */}
                <View className="bg-white rounded-2xl shadow-sm border border-gray-100 mb-6">
                    {/* Section Header */}
                    <View className="p-5 border-b border-gray-100">
                        <View className="flex-row items-center">
                            <View className="w-10 h-10 bg-green-100 rounded-xl items-center justify-center mr-3">
                                <Ionicons name="document-text-outline" size={22} color="#22c55e" />
                            </View>
                            <View className="flex-1">
                                <Text className="text-lg font-semibold text-gray-800">
                                    App Configuration
                                </Text>
                                <Text className="text-gray-400 text-sm">
                                    {currentConfig ? 'Configuration loaded' : 'No configuration found'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Actions */}
                    <View className="p-5 gap-3">
                        {/* Re-upload Config */}
                        <TouchableOpacity
                            onPress={handleReupload}
                            disabled={uploading}
                            className="flex-row items-center bg-green-500 rounded-xl px-5 py-4 shadow-sm">
                            {uploading ? (
                                <ActivityIndicator color="white" />
                            ) : (
                                <Ionicons name="cloud-upload-outline" size={22} color="white" />
                            )}
                            <Text className="text-white font-semibold text-base ml-3">
                                {uploading ? 'Uploading...' : 'Upload New Config File'}
                            </Text>
                        </TouchableOpacity>

                        {/* Edit Current Config */}
                        <TouchableOpacity
                            onPress={openEditModal}
                            disabled={!currentConfig}
                            className={`flex-row items-center rounded-xl px-5 py-4 border-2 ${currentConfig
                                ? 'border-green-500 bg-white'
                                : 'border-gray-200 bg-gray-50'
                                }`}>
                            <Ionicons
                                name="create-outline"
                                size={22}
                                color={currentConfig ? '#22c55e' : '#9ca3af'}
                            />
                            <Text
                                className={`font-semibold text-base ml-3 ${currentConfig ? 'text-green-600' : 'text-gray-400'
                                    }`}>
                                Edit Current Config
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
                                    Deletes config and requires re-upload on next launch
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>

            {/* Edit JSON Modal */}
            <Modal
                visible={editModalVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setEditModalVisible(false)}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    className="flex-1">
                    <View className="flex-1 justify-center items-center bg-black/50 px-6">
                        <View className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6">
                            {/* Modal Header */}
                            <View className="flex-row justify-between items-center mb-4">
                                <Text className="text-xl font-bold text-gray-800">
                                    Edit Configuration
                                </Text>
                                <TouchableOpacity
                                    onPress={() => setEditModalVisible(false)}
                                    className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center">
                                    <Text className="text-gray-500 font-bold text-lg">✕</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Edit Error */}
                            {editError && (
                                <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                                    <Text className="text-red-600 text-center font-medium text-sm">
                                        {editError}
                                    </Text>
                                </View>
                            )}

                            {/* JSON Editor */}
                            <ScrollView className="max-h-96">
                                <TextInput
                                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 text-sm font-mono"
                                    placeholder="Edit JSON configuration..."
                                    placeholderTextColor="#9ca3af"
                                    value={editJson}
                                    onChangeText={setEditJson}
                                    multiline
                                    numberOfLines={20}
                                    textAlignVertical="top"
                                    style={{ minHeight: 300, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </ScrollView>

                            {/* Modal Actions */}
                            <View className="flex-row mt-4 gap-3">
                                <TouchableOpacity
                                    onPress={() => setEditModalVisible(false)}
                                    className="flex-1 py-3 rounded-xl items-center justify-center border border-gray-200 bg-gray-50">
                                    <Text className="text-gray-600 font-semibold">Cancel</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={handleEditSave}
                                    disabled={editLoading}
                                    className={`flex-1 py-3 rounded-xl items-center justify-center ${editLoading ? 'bg-green-400' : 'bg-green-500'
                                        }`}>
                                    {editLoading ? (
                                        <ActivityIndicator color="white" />
                                    ) : (
                                        <Text className="text-white font-semibold">Save Changes</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </ScrollView >
    );
}
