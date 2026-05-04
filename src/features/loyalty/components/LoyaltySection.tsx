import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import {
  applyLoyalty,
  clearLoyalty,
  selectIsLoyaltyApplied,
  selectLoyaltyAmount,
  selectLoyaltyPoints,
  selectLoyaltyMobile,
} from '../loyaltySlice';
import { LoyaltyLookupModal } from './LoyaltyLookupModal';

interface Props {
  /** Current invoice total (pre-loyalty) — used to cap the loyalty amount. */
  invoiceTotal: number;
}

/**
 * Loyalty section displayed on the checkout page.
 * Shows either a "Get Loyalty Points" button or the applied loyalty summary.
 */
export function LoyaltySection({ invoiceTotal }: Props) {
  const dispatch = useAppDispatch();
  const isApplied = useAppSelector(selectIsLoyaltyApplied);
  const loyaltyAmount = useAppSelector(selectLoyaltyAmount);
  const loyaltyPoints = useAppSelector(selectLoyaltyPoints);
  const loyaltyMobile = useAppSelector(selectLoyaltyMobile);

  const [isModalVisible, setIsModalVisible] = useState(false);

  const handleApply = (data: { amount: number; points: number; mobile: string }) => {
    dispatch(applyLoyalty(data));
  };

  const handleClear = () => {
    dispatch(clearLoyalty());
  };

  if (isApplied) {
    return (
      <View className="mb-6">
        <Text className="text-gray-600 font-medium mb-2">Loyalty Points</Text>
        <View className="bg-green-50 border border-green-200 rounded-xl p-4">
          <View className="flex-row items-center mb-3">
            <View className="w-8 h-8 rounded-full bg-green-100 items-center justify-center mr-3">
              <Ionicons name="gift" size={16} color="#22c55e" />
            </View>
            <View className="flex-1">
              <Text className="text-green-800 font-semibold">Loyalty Applied</Text>
              <Text className="text-green-600 text-xs">Customer: {loyaltyMobile}</Text>
            </View>
          </View>

          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-gray-600 text-sm">Points Redeemed</Text>
            <Text className="text-green-700 font-bold">{loyaltyPoints}</Text>
          </View>
          <View className="flex-row justify-between items-center mb-3">
            <Text className="text-gray-600 text-sm">Discount Amount</Text>
            <Text className="text-green-700 font-bold">-SAR {loyaltyAmount.toFixed(2)}</Text>
          </View>

          <TouchableOpacity
            onPress={handleClear}
            className="bg-red-50 border border-red-200 py-2 rounded-lg items-center"
          >
            <Text className="text-red-600 font-semibold text-sm">Clear Loyalty</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View className="mb-6">
      <Text className="text-gray-600 font-medium mb-2">Loyalty Points</Text>
      <TouchableOpacity
        onPress={() => setIsModalVisible(true)}
        className="flex-row items-center bg-white border border-gray-200 rounded-xl p-4"
      >
        <View className="w-10 h-10 rounded-full bg-amber-100 items-center justify-center mr-3">
          <Ionicons name="gift-outline" size={20} color="#f59e0b" />
        </View>
        <View className="flex-1">
          <Text className="text-gray-800 font-semibold">Get Loyalty Points</Text>
          <Text className="text-gray-400 text-xs">
            Look up customer loyalty balance and redeem points
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9ca3af" />
      </TouchableOpacity>

      <LoyaltyLookupModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onApply={handleApply}
        invoiceTotal={invoiceTotal}
      />
    </View>
  );
}
