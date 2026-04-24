import type { SetupSettings } from '@/src/services/credentialStore';
import { saveCredentials } from '@/src/services/credentialStore';
import { yupResolver } from '@hookform/resolvers/yup';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as yup from 'yup';

// ─── Validation Schema ──────────────────────────────────────────────────────

const setupSchema = yup.object().shape({
  Host: yup
    .string()
    .required('Host URL is required')
    .url('Must be a valid URL (e.g. https://example.com/api/method)'),
  API_KEY: yup.string().required('API Key is required'),
  API_SECRET: yup.string().required('API Secret is required'),
  APP_KEY: yup.string().required('App Key is required'),
  CLIENT_SECRET: yup.string().required('Client Secret is required'),
  MACHINE_NAME: yup.string().required('Machine Name is required'),
  INVOICE_PREFIX: yup.string().required('Invoice Prefix is required'),
  BRANCH_ID: yup.string().required('Branch ID is required'),
});

type SetupFormValues = yup.InferType<typeof setupSchema>;

// ─── Field configuration ────────────────────────────────────────────────────

interface FieldConfig {
  name: keyof SetupFormValues;
  label: string;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'url';
}

const FIELDS: FieldConfig[] = [
  {
    name: 'Host',
    label: 'Host URL',
    placeholder: 'https://example.com/api/method',
    keyboardType: 'url',
    autoCapitalize: 'none',
  },
  {
    name: 'API_KEY',
    label: 'API Key',
    placeholder: 'API Key',
    autoCapitalize: 'none',
  },
  {
    name: 'API_SECRET',
    label: 'API Secret',
    placeholder: '••••••••',
    secureTextEntry: true,
    autoCapitalize: 'none',
  },
  {
    name: 'APP_KEY',
    label: 'App Key',
    placeholder: 'Base64 encoded app key',
    autoCapitalize: 'none',
  },
  {
    name: 'CLIENT_SECRET',
    label: 'Client Secret',
    placeholder: 'Client secret',
    secureTextEntry: true,
    autoCapitalize: 'none',
  },
  {
    name: 'MACHINE_NAME',
    label: 'Machine Name',
    placeholder: 'e.g. diaj6ei8fh',
    autoCapitalize: 'none',
  },
  {
    name: 'INVOICE_PREFIX',
    label: 'Invoice Prefix',
    placeholder: 'e.g. INV',
    autoCapitalize: 'characters',
  },
  {
    name: 'BRANCH_ID',
    label: 'Branch ID',
    placeholder: 'Branch ID',
    autoCapitalize: 'none',
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

interface SetupScreenProps {
  onConfigured: () => void;
}

export default function SetupScreen({ onConfigured }: SetupScreenProps) {
  const [submitStatus, setSubmitStatus] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<SetupFormValues>({
    resolver: yupResolver(setupSchema),
    defaultValues: {
      Host: '',
      API_KEY: '',
      API_SECRET: '',
      APP_KEY: '',
      CLIENT_SECRET: '',
      MACHINE_NAME: '',
      INVOICE_PREFIX: '',
      BRANCH_ID: '',
    },
  });

  const onSubmit = async (data: SetupFormValues) => {
    try {
      setSubmitStatus('loading');
      setSubmitError(null);

      console.log('[SetupScreen] Saving credentials from form...');
      const settings: SetupSettings = {
        Host: data.Host,
        API_KEY: data.API_KEY,
        API_SECRET: data.API_SECRET,
        APP_KEY: data.APP_KEY,
        CLIENT_SECRET: data.CLIENT_SECRET,
        MACHINE_NAME: data.MACHINE_NAME,
        INVOICE_PREFIX: data.INVOICE_PREFIX,
        BRANCH_ID: data.BRANCH_ID,
      };

      await saveCredentials(settings);
      console.log('[SetupScreen] Credentials saved successfully');

      setSubmitStatus('success');
      setTimeout(() => onConfigured(), 1000);
    } catch (err) {
      console.error('[SetupScreen] Error saving credentials:', err);
      setSubmitStatus('error');
      setSubmitError(
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      );
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-gradient-to-br from-gray-50 to-gray-100"
    >
      <ScrollView
        contentContainerClassName="items-center px-6 py-10"
        keyboardShouldPersistTaps="handled"
      >
        {/* Setup Card */}
        <View className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {/* Header */}
          <View className="items-center mb-6">
            <View className="w-16 h-16 bg-green-500 rounded-2xl items-center justify-center mb-4 shadow-lg">
              <Text className="text-3xl text-white font-bold">G</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-800">GPos Van</Text>
            <Text className="text-gray-500 mt-1">Initial Setup</Text>
          </View>

          {/* Description */}
          <View className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <Text className="text-blue-700 text-center text-sm leading-5">
              Welcome! Fill in your API credentials below to configure the
              application.
            </Text>
          </View>

          {/* Submit Error */}
          {submitStatus === 'error' && submitError && (
            <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <Text className="text-red-600 text-center font-medium text-sm">
                {submitError}
              </Text>
            </View>
          )}

          {/* Success */}
          {submitStatus === 'success' && (
            <View className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <Text className="text-green-600 text-center font-medium text-sm">
                ✓ Credentials saved successfully! Redirecting…
              </Text>
            </View>
          )}

          {/* Form Fields */}
          {FIELDS.map((field) => (
            <View key={field.name} className="mb-4">
              <Text className="text-gray-700 font-semibold text-sm mb-1.5">
                {field.label} <Text className="text-red-500">*</Text>
              </Text>
              <Controller
                control={control}
                name={field.name}
                render={({ field: { onChange, onBlur, value } }) => (
                  <TextInput
                    className={`w-full bg-gray-50 border rounded-xl px-4 py-3 text-gray-800 text-sm ${errors[field.name]
                      ? 'border-red-400'
                      : 'border-gray-200'
                      }`}
                    placeholder={field.placeholder}
                    placeholderTextColor="#9ca3af"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    secureTextEntry={field.secureTextEntry}
                    autoCapitalize={field.autoCapitalize ?? 'none'}
                    autoCorrect={false}
                    keyboardType={field.keyboardType ?? 'default'}
                    editable={submitStatus !== 'success'}
                  />
                )}
              />
              {errors[field.name] && (
                <Text className="text-red-500 text-xs mt-1">
                  {errors[field.name]?.message}
                </Text>
              )}
            </View>
          ))}

          {/* Submit Button */}
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={submitStatus === 'loading' || submitStatus === 'success'}
            className={`w-full py-4 rounded-xl items-center justify-center shadow-lg mt-2 ${submitStatus === 'loading' || submitStatus === 'success'
              ? 'bg-green-400'
              : 'bg-green-500'
              }`}
          >
            {submitStatus === 'loading' ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">
                {submitStatus === 'error'
                  ? 'Try Again'
                  : 'Save Configuration'}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text className="mt-8 text-gray-400 text-sm">
          © 2026 GPosVan. All rights reserved.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
