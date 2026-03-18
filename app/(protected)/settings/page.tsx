import type { AppConfig } from '@/src/features/app/types';
import {
    clearAppConfig,
    getAppConfig,
    saveAppConfig,
} from '@/src/services/configStore';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import React, { useEffect, useState } from 'react';
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

export default function SettingsPage() {
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

    // --- Re-upload JSON file ---
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

    // --- Edit current config ---
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

    // --- Reset config ---
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

    if (isLoadingConfig) {
        return (
            <View className="flex-1 items-center justify-center">
                <ActivityIndicator size="large" color="#22c55e" />
                <Text className="mt-4 text-gray-500">Loading settings...</Text>
            </View>
        );
    }

    return (
        <ScrollView className="flex-1 bg-gray-50">
            <View className="p-6 max-w-2xl self-center w-full">
                {/* Page Header */}
                <Text className="text-2xl font-bold text-gray-800 mb-1">Settings</Text>
                <Text className="text-gray-500 mb-6">
                    Manage your app configuration
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

                {/* Configuration Section */}
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

                {/* Danger Zone */}
                <View className="bg-white rounded-2xl shadow-sm border border-red-100">
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
        </ScrollView>
    );
}
