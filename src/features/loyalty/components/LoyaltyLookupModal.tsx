import NetInfo from '@react-native-community/netinfo';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { generateOtp, getLoyaltyPoints, validateOtp } from '../services/loyaltyApi.service';
import type { LoyaltyPointsData } from '../types';

type Step = 'mobile' | 'display' | 'otp';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Called after successful OTP verification with the loyalty data. */
  onApply: (data: { amount: number; points: number; mobile: string }) => void;
  /** Current invoice total — loyalty amount will be capped at this value. */
  invoiceTotal: number;
  /** Mobile number passed from the checkout form */
  initialMobileNo?: string;
  /** Whether to automatically fetch points when the modal opens with a valid initialMobileNo */
  autoFetch?: boolean;
}

export function LoyaltyLookupModal({ visible, onClose, onApply, invoiceTotal, initialMobileNo, autoFetch }: Props) {
  const [step, setStep] = useState<Step>('mobile');
  const [mobileNo, setMobileNo] = useState('');
  const [loyaltyData, setLoyaltyData] = useState<LoyaltyPointsData | null>(null);
  const [otp, setOtp] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [cappedAmount, setCappedAmount] = useState<number | null>(null);

  const checkNetwork = useCallback(async (): Promise<boolean> => {
    const state = await NetInfo.fetch();
    if (!state.isConnected) {
      Alert.alert(
        'No Internet Connection',
        'Connect to the internet to use loyalty features.',
      );
      return false;
    }
    return true;
  }, []);

  // Reset state when modal opens/closes, or auto-fetch
  useEffect(() => {
    if (visible) {
      if (initialMobileNo) {
        setMobileNo(initialMobileNo);
        if (autoFetch) {
          // Wrap in an async IIFE to call handleGetPoints with the initial mobile number
          (async () => {
            const isOnline = await checkNetwork();
            if (!isOnline) return;

            setIsLoading(true);
            setError('');
            try {
              const data = await getLoyaltyPoints(initialMobileNo);
              setLoyaltyData(data);
              if (data.Amount > invoiceTotal) {
                setCappedAmount(invoiceTotal);
              } else {
                setCappedAmount(null);
              }
              setStep('display');
            } catch (err: any) {
              const message =
                err?.response?.data?.message || err?.message || 'Failed to fetch loyalty points.';
              setError(message);
            } finally {
              setIsLoading(false);
            }
          })();
        }
      } else {
        setStep('mobile');
        setMobileNo('');
        setLoyaltyData(null);
        setOtp('');
        setIsLoading(false);
        setError('');
        setCappedAmount(null);
      }
    } else {
      setStep('mobile');
      setMobileNo('');
      setLoyaltyData(null);
      setOtp('');
      setIsLoading(false);
      setError('');
      setCappedAmount(null);
    }
  }, [visible, initialMobileNo, autoFetch, invoiceTotal, checkNetwork]);

  // ─── Step 1: Fetch Loyalty Points ────────────────────────────────────────────

  const handleGetPoints = async () => {
    if (mobileNo.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    const isOnline = await checkNetwork();
    if (!isOnline) return;

    setIsLoading(true);
    setError('');

    try {
      const data = await getLoyaltyPoints(mobileNo);
      setLoyaltyData(data);

      // Cap the loyalty amount at the invoice total
      if (data.Amount > invoiceTotal) {
        setCappedAmount(invoiceTotal);
      } else {
        setCappedAmount(null);
      }

      setStep('display');
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to fetch loyalty points.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Step 2: Initiate Claim → Send OTP ───────────────────────────────────────

  const handleClaim = async () => {
    const isOnline = await checkNetwork();
    if (!isOnline) return;

    setIsLoading(true);
    setError('');

    try {
      await generateOtp(mobileNo);
      setStep('otp');
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to send OTP.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Step 3: Verify OTP (Server-side) ────────────────────────────────────────

  const handleVerifyOtp = async () => {
    if (otp.length < 4) {
      setError('Please enter the OTP received by the customer.');
      return;
    }

    const isOnline = await checkNetwork();
    if (!isOnline) return;

    setIsLoading(true);
    setError('');

    try {
      const isValid = await validateOtp(mobileNo, otp);

      if (isValid) {
        const finalAmount = cappedAmount ?? loyaltyData?.Amount ?? 0;
        const finalPoints = loyaltyData?.loyalty_points ?? 0;

        onApply({
          amount: finalAmount,
          points: finalPoints,
          mobile: mobileNo,
        });
        onClose();
      } else {
        setError('Invalid OTP. Please try again.');
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.message || err?.message || 'Failed to verify OTP.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const renderMobileStep = () => (
    <>
      <Text className="text-xl font-bold text-gray-800 mb-1">Loyalty Points Lookup</Text>
      <Text className="text-gray-500 text-sm mb-5">
        Enter the customer's mobile number to check loyalty balance.
      </Text>

      <View className="mb-4">
        <Text className="text-gray-600 text-sm font-medium mb-1">Mobile Number</Text>
        <TextInput
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800 text-base"
          placeholder="Enter 10-digit mobile number"
          placeholderTextColor="#9ca3af"
          value={mobileNo}
          onChangeText={(text) => {
            setMobileNo(text.replace(/\D/g, '').slice(0, 10));
            setError('');
          }}
          keyboardType="phone-pad"
          maxLength={10}
          autoFocus
        />
      </View>

      {error ? (
        <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <Text className="text-red-600 text-sm">{error}</Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={onClose}
          className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
        >
          <Text className="text-gray-700 font-semibold">Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleGetPoints}
          disabled={isLoading || mobileNo.length < 10}
          className={`flex-1 py-3 rounded-xl items-center ${isLoading || mobileNo.length < 10 ? 'bg-gray-300' : 'bg-green-500'
            }`}
        >
          {isLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-semibold">Get Points</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const renderDisplayStep = () => {
    const displayAmount = cappedAmount ?? loyaltyData?.Amount ?? 0;
    const displayPoints = loyaltyData?.loyalty_points ?? 0;

    return (
      <>
        <Text className="text-xl font-bold text-gray-800 mb-1">Loyalty Balance</Text>
        <Text className="text-gray-500 text-sm mb-5">
          Customer: {mobileNo}
        </Text>

        <View className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-gray-600 font-medium">Points Available</Text>
            <Text className="text-green-700 font-bold text-lg">{displayPoints}</Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-gray-600 font-medium">Amount (SAR)</Text>
            <Text className="text-green-700 font-bold text-lg">{displayAmount.toFixed(2)}</Text>
          </View>
        </View>

        {cappedAmount !== null ? (
          <View className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <Text className="text-amber-700 text-sm">
              ⚠️ Loyalty amount capped at invoice total (SAR {invoiceTotal.toFixed(2)}).
              Original amount: SAR {(loyaltyData?.Amount ?? 0).toFixed(2)}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        ) : null}

        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={() => {
              setStep('mobile');
              setError('');
            }}
            className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
          >
            <Text className="text-gray-700 font-semibold">Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleClaim}
            disabled={isLoading || displayPoints <= 0}
            className={`flex-1 py-3 rounded-xl items-center ${isLoading || displayPoints <= 0 ? 'bg-gray-300' : 'bg-green-500'
              }`}
          >
            {isLoading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text className="text-white font-semibold">Claim</Text>
            )}
          </TouchableOpacity>
        </View>
      </>
    );
  };

  const renderOtpStep = () => (
    <>
      <Text className="text-xl font-bold text-gray-800 mb-1">Verify OTP</Text>
      <Text className="text-gray-500 text-sm mb-5">
        An OTP has been sent to the customer's phone ({mobileNo}). Enter it below.
      </Text>

      <View className="mb-4">
        <Text className="text-gray-600 text-sm font-medium mb-1">OTP Code</Text>
        <TextInput
          className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-gray-800 text-base text-center tracking-widest"
          placeholder="Enter OTP"
          placeholderTextColor="#9ca3af"
          value={otp}
          onChangeText={(text) => {
            setOtp(text.replace(/\D/g, '').slice(0, 6));
            setError('');
          }}
          keyboardType="number-pad"
          maxLength={6}
          autoFocus
        />
      </View>

      {error ? (
        <View className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <Text className="text-red-600 text-sm">{error}</Text>
        </View>
      ) : null}

      <View className="flex-row gap-3">
        <TouchableOpacity
          onPress={() => {
            setStep('display');
            setOtp('');
            setError('');
          }}
          className="flex-1 bg-gray-100 py-3 rounded-xl items-center"
        >
          <Text className="text-gray-700 font-semibold">Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleVerifyOtp}
          disabled={isLoading || otp.length < 4}
          className={`flex-1 py-3 rounded-xl items-center ${isLoading || otp.length < 4 ? 'bg-gray-300' : 'bg-green-500'
            }`}
        >
          {isLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text className="text-white font-semibold">Verify</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View className="flex-1 bg-black/50 justify-center items-center p-4">
        <View className="bg-white rounded-2xl w-full max-w-md p-5">
          {step === 'mobile' && renderMobileStep()}
          {step === 'display' && renderDisplayStep()}
          {step === 'otp' && renderOtpStep()}
        </View>
      </View>
    </Modal>
  );
}
