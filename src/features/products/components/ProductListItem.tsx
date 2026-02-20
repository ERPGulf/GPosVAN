import { ProductWithUom } from '@/src/features/products/types/product.types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface ProductListItemProps {
  product: ProductWithUom;
  onPress: (product: ProductWithUom) => void;
}

export function ProductListItem({ product, onPress }: ProductListItemProps) {
  // Use UOM price if available, fallback to product base price
  const rate = product.uomPrice ?? product.price ?? 0;
  const uomName = product.uom || 'Piece';

  return (
    <TouchableOpacity
      className="flex-row items-center bg-white border-b border-gray-100 py-5 px-5"
      onPress={() => onPress(product)}
      activeOpacity={0.7}
    >
      {/* Column 1: Item Details */}
      <View className="w-[250px] pr-3">
        <Text className="text-sm font-semibold text-gray-800 mb-0.5" numberOfLines={1}>
          {product.name || 'Unnamed Product'}
        </Text>
        {product.localizedEnglishName ? (
          <Text className="text-xs text-gray-500 mb-1" numberOfLines={1}>
            {product.localizedEnglishName}
          </Text>
        ) : null}
      </View>

      {/* Column 2: Rate */}
      <View className="w-[90px] items-start pl-1">
        <Text className="text-sm font-semibold text-gray-800">
          {rate.toFixed(0)}{' '}
          <Text className="text-xs font-normal text-gray-500">SAR</Text>
        </Text>
      </View>

      {/* Column 3: UOM */}
      <View className="w-[90px] items-start pl-3">
        <View className="rounded px-2.5 py-1 items-center min-w-[50px] bg-gray-100">
          <Text className="text-[13px] font-semibold text-gray-700">
            {uomName}
          </Text>
        </View>
      </View>

      {/* Column 4: Item Code */}
      <View className="w-[140px] pl-4">
        <Text className="text-xs text-gray-600 font-mono" numberOfLines={1}>
          {product.itemCode || '-'}
        </Text>
      </View>

      {/* Add Button */}
      <View className="w-[50px] items-center justify-center">
        <View className="w-8 h-8 rounded-full border-[1.5px] border-green-500 items-center justify-center bg-white">
          <Ionicons name="add" size={20} color="#22c55e" />
        </View>
      </View>

      {/* Spacer */}
      <View className="flex-1" />
    </TouchableOpacity>
  );
}
