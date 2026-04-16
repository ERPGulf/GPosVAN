import { setAppConfig, selectAppConfig } from '@/src/features/app/appConfigSlice';
import { fetchPosSettings } from '@/src/features/app/services/posSettings.service';
import { login } from '@/src/features/auth/authSlice';
import * as schema from '@/src/infrastructure/db/schema';
import { authenticateUser } from '@/src/infrastructure/db/users.repository';
import { generateAppToken, generateUserToken } from '@/src/services/api/httpClient';
import { clearUserTokens } from '@/src/services/api/tokenManager';
import { getBranchId, getMachineName } from '@/src/services/credentialStore';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { yupResolver } from '@hookform/resolvers/yup';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as yup from 'yup';
import './global.css';

// Validation schema
const loginSchema = yup.object().shape({
  email: yup.string().required('Email is required'),
  password: yup.string().required('Password is required'),
});

type LoginFormData = yup.InferType<typeof loginSchema>;

export default function LoginScreen() {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db, { schema });
  const router = useRouter();
  const dispatch = useAppDispatch();
  const existingAppConfig = useAppSelector(selectAppConfig);

  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginError(null);

    try {
      // Try online login first: generate app token → generate user token
      const appToken = await generateAppToken();
      const userResponse = await generateUserToken(data.email, data.password, appToken);

      // API login succeeded — user tokens already saved to SecureStore by generateUserToken
      // Authenticate against local SQLite to get the full user profile
      const localResult = await authenticateUser(drizzleDb, data.email, data.password);

      if (localResult.success && localResult.user) {
        const { password: _, ...userWithoutPassword } = localResult.user;
        dispatch(login(userWithoutPassword));
      } else {
        // User exists on server but not in local DB — create a minimal user from API response
        dispatch(
          login({
            id: userResponse.user.id,
            email: userResponse.user.email,
            username: userResponse.user.email,
          }),
        );
      }

      // ─── Fetch POS Settings (after tokens generated, before sync) ───
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
        if (__DEV__) {
          console.log('[Login] POS settings fetched and saved to Redux');
        }
      } catch (posErr) {
        // pos_settings API failed — check for cached config
        if (existingAppConfig) {
          if (__DEV__) {
            console.log('[Login] pos_settings fetch failed, using cached config');
          }
        } else {
          // No cached config — block login
          setLoginError(
            'Failed to fetch POS settings and no cached configuration found. Please ensure you have an internet connection for the first login.',
          );
          setIsLoading(false);
          return;
        }
      }

      router.replace('/(protected)');
    } catch (apiError: any) {
      // Check if this is a network error (offline) — fall back to local login
      const isNetworkError =
        apiError?.code === 'ECONNABORTED' ||
        apiError?.code === 'ERR_NETWORK' ||
        apiError?.message?.includes('Network Error') ||
        !apiError?.response;

      if (isNetworkError) {
        if (__DEV__) {
          console.log('[Login] API unavailable, falling back to offline login');
        }

        // For offline login, we need cached AppConfig to exist
        if (!existingAppConfig) {
          setLoginError(
            'Cannot login offline without a prior successful login. Please connect to the internet.',
          );
          setIsLoading(false);
          return;
        }

        try {
          const offlineResult = await authenticateUser(drizzleDb, data.email, data.password);

          if (offlineResult.success && offlineResult.user) {
            // Clear any stale tokens since we're offline
            await clearUserTokens();

            const { password: _, ...userWithoutPassword } = offlineResult.user;
            dispatch(login(userWithoutPassword));
            router.replace('/(protected)');
          } else {
            setLoginError(offlineResult.error || 'Invalid credentials');
          }
        } catch (offlineError) {
          setLoginError('Login failed. Please try again.');
        }
      } else {
        // API returned an error (invalid credentials, etc.)
        const errorMessage =
          apiError?.response?.data?.message ||
          apiError?.response?.data?.exc ||
          'Invalid email or password';
        setLoginError(errorMessage);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1"
    >
      <View className="flex-1 items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 px-6">
        {/* Login Card */}
        <View className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
          {/* Header */}
          <View className="items-center mb-8">
            <View className="w-16 h-16 bg-green-500 rounded-2xl items-center justify-center mb-4 shadow-lg">
              <Text className="text-3xl text-white font-bold">V</Text>
            </View>
            <Text className="text-2xl font-bold text-gray-800">GPos Van</Text>
            <Text className="text-gray-500 mt-1">Sign in to continue</Text>
          </View>

          {/* Error Message */}
          {loginError && (
            <View className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <Text className="text-red-600 text-center font-medium">{loginError}</Text>
            </View>
          )}

          {/* Email Field */}
          <View className="mb-5">
            <Text className="text-gray-700 font-semibold mb-2 ml-1">Email</Text>
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-800 text-base ${errors.email ? 'border-red-400' : 'border-gray-200'
                    }`}
                  placeholder="Enter your email"
                  placeholderTextColor="#9ca3af"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
              )}
            />
            {errors.email && (
              <Text className="text-red-500 text-sm mt-1 ml-1">{errors.email.message}</Text>
            )}
          </View>

          {/* Password Field */}
          <View className="mb-6">
            <Text className="text-gray-700 font-semibold mb-2 ml-1">Password</Text>
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-800 text-base ${errors.password ? 'border-red-400' : 'border-gray-200'
                    }`}
                  placeholder="Enter your password"
                  placeholderTextColor="#9ca3af"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            />
            {errors.password && (
              <Text className="text-red-500 text-sm mt-1 ml-1">{errors.password.message}</Text>
            )}
          </View>

          {/* Login Button */}
          <TouchableOpacity
            onPress={handleSubmit(onSubmit)}
            disabled={isLoading}
            className={`w-full py-4 rounded-xl items-center justify-center shadow-lg ${isLoading ? 'bg-green-400' : 'bg-green-500'
              }`}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-white font-bold text-lg">Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Offline Mode Notice */}
          <View className="mt-6 items-center">
            <View className="flex-row items-center">
              <View className="w-2 h-2 bg-green-500 rounded-full mr-2" />
              <Text className="text-gray-500 text-sm">Offline mode available</Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text className="mt-8 text-gray-400 text-sm">© 2026 GPos Van. All rights reserved.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}
