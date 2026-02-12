import { useAuth, useUsers } from '@/src/features/auth';
import * as schema from '@/src/infrastructure/db/schema';
import { authenticateUser } from '@/src/infrastructure/db/users.repository';
import { yupResolver } from '@hookform/resolvers/yup';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { useDrizzleStudio } from 'expo-drizzle-studio-plugin';
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
  username: yup.string().required('Username is required'),
  password: yup.string().required('Password is required'),
});

type LoginFormData = yup.InferType<typeof loginSchema>;

export default function LoginScreen() {
  const db = useSQLiteContext();
  const drizzleDb = drizzle(db, { schema });
  useDrizzleStudio(db);
  const router = useRouter();
  const { login } = useAuth();

  // Sync offline users from API
  const { isLoading: isSyncingUsers } = useUsers();

  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: yupResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setLoginError(null);

    try {
      const result = await authenticateUser(drizzleDb, data.username, data.password);

      if (result.success && result.user) {
        // Store user in AsyncStorage via AuthContext
        await login(result.user);
        // Navigate to protected area after successful login
        router.replace('/(protected)');
      } else {
        setLoginError(result.error || 'Login failed');
      }
    } catch (error) {
      setLoginError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (isSyncingUsers) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#22c55e" />
        <Text className="mt-4 text-gray-600">Syncing data...</Text>
      </View>
    );
  }

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

          {/* Username Field */}
          <View className="mb-5">
            <Text className="text-gray-700 font-semibold mb-2 ml-1">Username</Text>
            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-xl text-gray-800 text-base ${errors.username ? 'border-red-400' : 'border-gray-200'
                    }`}
                  placeholder="Enter your username"
                  placeholderTextColor="#9ca3af"
                  onBlur={onBlur}
                  onChangeText={onChange}
                  value={value}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
            />
            {errors.username && (
              <Text className="text-red-500 text-sm mt-1 ml-1">{errors.username.message}</Text>
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
