import type { AppConfig } from '@/src/features/app/types';
import { saveAppConfig } from '@/src/services/configStore';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import React, { useState } from 'react';
import {
  ActivityIndicator,
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
 * Minimal validation: checks that the parsed JSON has the required
 * top-level keys of the AppConfig type.
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
  if (typeof obj.cardpay_settings !== 'object' || obj.cardpay_settings === null)
    return false;
  if (typeof obj.branch_details !== 'object' || obj.branch_details === null)
    return false;

  return true;
}

/**
 * Shared logic: parse, validate, and save config JSON string.
 * Returns an error message string on failure, or null on success.
 */
async function processConfigJson(content: string): Promise<string | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
    console.log('[SetupScreen] JSON parsed successfully');
  } catch {
    console.error('[SetupScreen] Failed to parse JSON');
    return 'Invalid JSON. Please check the format.';
  }

  if (!validateAppConfig(parsed)) {
    console.error('[SetupScreen] Validation failed — missing required fields');
    return 'Invalid configuration. The JSON is missing required fields.';
  }

  console.log('[SetupScreen] Validation passed, saving config...');
  await saveAppConfig(parsed);
  console.log('[SetupScreen] Config saved successfully');
  return null;
}

interface SetupScreenProps {
  onConfigured: () => void;
}

export default function SetupScreen({ onConfigured }: SetupScreenProps) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Paste modal state
  const [pasteModalVisible, setPasteModalVisible] = useState(false);
  const [pastedJson, setPastedJson] = useState('');
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [pasteLoading, setPasteLoading] = useState(false);

  const handlePickFile = async () => {
    try {
      setStatus('loading');
      setErrorMessage(null);

      console.log('[SetupScreen] Opening document picker...');
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        console.log('[SetupScreen] User cancelled file picker');
        setStatus('idle');
        return;
      }

      const file = result.assets[0];
      setFileName(file.name);
      console.log(`[SetupScreen] File selected: ${file.name}`);

      if (!file.name.toLowerCase().endsWith('.json')) {
        console.error('[SetupScreen] Invalid file type:', file.name);
        setStatus('error');
        setErrorMessage('Please select a .json file.');
        return;
      }

      console.log('[SetupScreen] Reading file contents...');
      const fileObj = new File(file.uri);
      const content = fileObj.textSync();
      console.log(`[SetupScreen] File read successfully (${content.length} chars)`);

      const error = await processConfigJson(content);
      if (error) {
        setStatus('error');
        setErrorMessage(error);
        return;
      }

      setStatus('success');
      console.log('[SetupScreen] Config saved, transitioning to app...');
      setTimeout(() => onConfigured(), 1000);
    } catch (err) {
      console.error('[SetupScreen] Error:', err);
      setStatus('error');
      setErrorMessage(
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      );
    }
  };

  const handlePasteSubmit = async () => {
    if (!pastedJson.trim()) {
      setPasteError('Please paste your JSON configuration.');
      return;
    }

    setPasteLoading(true);
    setPasteError(null);

    try {
      console.log('[SetupScreen] Processing pasted JSON...');
      const error = await processConfigJson(pastedJson.trim());
      if (error) {
        setPasteError(error);
        setPasteLoading(false);
        return;
      }

      setPasteLoading(false);
      setPasteModalVisible(false);
      setStatus('success');
      console.log('[SetupScreen] Pasted config saved, transitioning to app...');
      setTimeout(() => onConfigured(), 1000);
    } catch (err) {
      console.error('[SetupScreen] Paste error:', err);
      setPasteError(
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      );
      setPasteLoading(false);
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-6">
      {/* Setup Card */}
      <View className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        {/* Header */}
        <View className="items-center mb-8">
          <View className="w-16 h-16 bg-green-500 rounded-2xl items-center justify-center mb-4 shadow-lg">
            <Text className="text-3xl text-white font-bold">G</Text>
          </View>
          <Text className="text-2xl font-bold text-gray-800">GPos Van</Text>
          <Text className="text-gray-500 mt-1">Initial Setup</Text>
        </View>

        {/* Description */}
        <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <Text className="text-blue-700 text-center text-sm leading-5">
            Welcome! To get started, upload your configuration file or paste the
            JSON data.
          </Text>
        </View>

        {/* Error */}
        {status === 'error' && errorMessage && (
          <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <Text className="text-red-600 text-center font-medium text-sm">
              {errorMessage}
            </Text>
          </View>
        )}

        {/* Success */}
        {status === 'success' && (
          <View className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
            <Text className="text-green-600 text-center font-medium text-sm">
              ✓ Configuration saved successfully! Redirecting…
            </Text>
          </View>
        )}

        {/* File name indicator */}
        {fileName && status !== 'success' && (
          <View className="bg-gray-50 border border-gray-200 rounded-xl p-3 mb-4">
            <Text className="text-gray-600 text-center text-sm" numberOfLines={1}>
              📄 {fileName}
            </Text>
          </View>
        )}

        {/* Upload File Button */}
        <TouchableOpacity
          onPress={handlePickFile}
          disabled={status === 'loading' || status === 'success'}
          className={`w-full py-4 rounded-xl items-center justify-center shadow-lg ${status === 'loading' || status === 'success'
            ? 'bg-green-400'
            : 'bg-green-500'
            }`}>
          {status === 'loading' ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="text-white font-bold text-lg">
              {status === 'error' ? 'Try Again' : 'Upload Configuration'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View className="flex-row items-center my-4">
          <View className="flex-1 h-px bg-gray-200" />
          <Text className="mx-3 text-gray-400 text-sm">or</Text>
          <View className="flex-1 h-px bg-gray-200" />
        </View>

        {/* Paste JSON Button */}
        <TouchableOpacity
          onPress={() => {
            setPastedJson('');
            setPasteError(null);
            setPasteModalVisible(true);
          }}
          disabled={status === 'success'}
          className={`w-full py-4 rounded-xl items-center justify-center border-2 ${status === 'success'
            ? 'border-gray-200 bg-gray-50'
            : 'border-green-500 bg-white'
            }`}>
          <Text
            className={`font-bold text-lg ${status === 'success' ? 'text-gray-400' : 'text-green-600'
              }`}>
            Paste JSON
          </Text>
        </TouchableOpacity>

        {/* Accepted format */}
        <View className="mt-4 items-center">
          <Text className="text-gray-400 text-xs">Accepted format: .json</Text>
        </View>
      </View>

      {/* Footer */}
      <Text className="mt-8 text-gray-400 text-sm">
        © 2026 GPosVan. All rights reserved.
      </Text>

      {/* Paste JSON Modal */}
      <Modal
        visible={pasteModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasteModalVisible(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1">
          <View className="flex-1 justify-center items-center bg-black/50 px-6">
            <View className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6">
              {/* Modal Header */}
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-xl font-bold text-gray-800">
                  Paste JSON Configuration
                </Text>
                <TouchableOpacity
                  onPress={() => setPasteModalVisible(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center">
                  <Text className="text-gray-500 font-bold text-lg">✕</Text>
                </TouchableOpacity>
              </View>

              {/* Paste Error */}
              {pasteError && (
                <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <Text className="text-red-600 text-center font-medium text-sm">
                    {pasteError}
                  </Text>
                </View>
              )}

              {/* Text Input */}
              <ScrollView className="max-h-80">
                <TextInput
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-4 text-gray-800 text-sm"
                  placeholder='Paste your JSON configuration here...'
                  placeholderTextColor="#9ca3af"
                  value={pastedJson}
                  onChangeText={setPastedJson}
                  multiline
                  numberOfLines={12}
                  textAlignVertical="top"
                  style={{ minHeight: 200 }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </ScrollView>

              {/* Modal Actions */}
              <View className="flex-row mt-4 gap-3">
                <TouchableOpacity
                  onPress={() => setPasteModalVisible(false)}
                  className="flex-1 py-3 rounded-xl items-center justify-center border border-gray-200 bg-gray-50">
                  <Text className="text-gray-600 font-semibold">Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handlePasteSubmit}
                  disabled={pasteLoading}
                  className={`flex-1 py-3 rounded-xl items-center justify-center ${pasteLoading ? 'bg-green-400' : 'bg-green-500'
                    }`}>
                  {pasteLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-semibold">Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
