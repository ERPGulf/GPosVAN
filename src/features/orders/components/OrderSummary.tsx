import { selectIsShiftOpen } from '@/src/features/shifts/shiftSlice';
import { useAppSelector } from '@/src/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CartItem } from '../../cart/types';
import {
  calculateItemDiscount,
  calculateItemTotal,
  calculateTotalDiscount,
  getDiscountedUnitPrice,
} from '../../cart/discountUtils';

interface OrderSummaryProps {
  cartItems: CartItem[];
  onRemoveItem: (index: number) => void;
  onUpdateQuantity: (index: number, delta: number) => void;
  onCheckout: () => void;
  showActions?: boolean;
  loyaltyDiscount?: number;
}

export function OrderSummary({ cartItems, onRemoveItem, onUpdateQuantity, onCheckout, showActions = true, loyaltyDiscount = 0 }: OrderSummaryProps) {
  const isShiftOpen = useAppSelector(selectIsShiftOpen);

  const subtotal = cartItems.reduce((sum, item) => {
    const rate = item.product.uomPrice ?? item.product.price ?? 0;
    return sum + rate * item.quantity;
  }, 0);
  const discount = calculateTotalDiscount(cartItems);
  const total = subtotal - discount;

  const handleCheckoutPress = () => {
    if (cartItems.length === 0) {
      Alert.alert('Empty Cart', 'Please add at least 1 product before checking out.');
      return;
    }
    if (!isShiftOpen) {
      Alert.alert('Please open a shift before checking out.');
      return;
    }
    onCheckout();
  };

  return (
    <View className="flex-col h-full bg-white border-l border-gray-200">
      <View className="p-4 border-b border-gray-100">
        <Text className="text-lg font-bold text-gray-800">Current Order</Text>
      </View>

      <ScrollView className="flex-1 p-4">
        {cartItems.length === 0 ? (
          <View className="items-center justify-center py-10">
            <Text className="text-gray-400">No items added</Text>
          </View>
        ) : (
          cartItems.map((item, index) => {
            const originalRate = item.product.uomPrice ?? item.product.price ?? 0;
            const hasPromo = !!item.promotion;
            const lineTotal = calculateItemTotal(item);
            const lineDiscount = calculateItemDiscount(item);

            return (
              <View
                key={`${item.product.itemCode}-${item.product.uomId}-${index}`}
                className={`flex-row items-center justify-between mb-4 p-3 rounded-lg ${hasPromo ? 'bg-green-50 border border-green-200' : 'bg-gray-50'}`}>
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
                    {item.product.name}
                  </Text>
                  <Text className="text-xs text-gray-500">{item.product.itemCode}</Text>

                  {/* Price row: show original + discounted if promo active */}
                  {hasPromo ? (
                    <View className="flex-row items-center mt-1 gap-2">
                      <Text className="text-sm text-gray-400 line-through">
                        {originalRate.toFixed(2)}
                      </Text>
                      <Text className="text-sm text-green-600 font-semibold">
                        {getDiscountedUnitPrice(originalRate, item.promotion!).toFixed(2)} SAR
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-sm text-gray-600 mt-1">
                      {originalRate.toFixed(2)} SAR ({item.product.uom || 'Piece'})
                    </Text>
                  )}

                  {/* Promotion badge */}
                  {hasPromo && (
                    <View className="flex-row items-center mt-1">
                      <View className="bg-green-500 rounded px-2 py-0.5 flex-row items-center">
                        <Ionicons name="pricetag" size={10} color="white" />
                        <Text className="text-white text-xs font-medium ml-1">
                          {item.promotion!.discountType === 'PERCENTAGE'
                            ? `${item.promotion!.discountPercentage}% OFF`
                            : item.promotion!.discountType === 'AMOUNT'
                              ? `${item.promotion!.discountPrice} OFF`
                              : `Special Price`}
                        </Text>
                      </View>
                      {lineDiscount > 0 && (
                        <Text className="text-xs text-green-600 ml-2">
                          Save {lineDiscount.toFixed(2)}
                        </Text>
                      )}
                    </View>
                  )}
                </View>

                <View className="items-end gap-2">
                  <Text className="text-sm font-bold">
                    {lineTotal.toFixed(2)}
                  </Text>

                  <View className="flex-row items-center bg-white rounded-lg border border-gray-200 p-1">
                    <TouchableOpacity onPress={() => onUpdateQuantity(index, -1)} className="p-1">
                      <Ionicons name="remove" size={16} color="#4b5563" />
                    </TouchableOpacity>

                    <Text className="mx-2 font-medium w-4 text-center">{item.quantity}</Text>

                    <TouchableOpacity onPress={() => onUpdateQuantity(index, 1)} className="p-1">
                      <Ionicons name="add" size={16} color="#4b5563" />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity onPress={() => onRemoveItem(index)} className="ml-2 p-1">
                  <Ionicons name="trash-outline" size={18} color="#ef4444" />
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      <View className="p-4 bg-gray-50 border-t border-gray-200">
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-500">Subtotal</Text>
          <Text className="font-medium">{subtotal.toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between mb-4">
          <Text className="text-gray-500">Discount</Text>
          <Text className={`font-medium ${discount > 0 ? 'text-green-600' : 'text-red-500'}`}>
            -{discount.toFixed(2)}
          </Text>
        </View>
        {loyaltyDiscount > 0 && (
          <View className="flex-row justify-between mb-4">
            <Text className="text-gray-500">Loyalty discount</Text>
            <Text className="font-medium text-green-600">
              -{loyaltyDiscount.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between mb-6 pt-4 border-t border-gray-200">
          <Text className="text-lg font-bold">Total</Text>
          <Text className="text-lg font-bold">{Math.max(0, total - loyaltyDiscount).toFixed(2)}</Text>
        </View>

        {showActions && (
          <View className="flex-row gap-3">
            <TouchableOpacity onPress={handleCheckoutPress} className="flex-1 bg-green-500 py-3 rounded-xl items-center">
              <Text className="font-semibold text-white">Checkout</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
