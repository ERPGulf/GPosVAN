import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Product } from '../types';

interface ProductListItemProps {
  product: Product;
  onPress: (product: Product) => void;
}

export function ProductListItem({ product, onPress }: ProductListItemProps) {
  const stockQty = product.actual_qty ?? 0;
  const isInStock = stockQty > 0;
  const stockUom = product.stock_uom || 'Piece';

  return (
    <TouchableOpacity
      className="flex-row items-center bg-white border-b border-gray-100 py-5 px-5"
      onPress={() => onPress(product)}
      activeOpacity={0.7}
    >
      {/* Column 1: Item Details */}
      <View className="w-[250px] pr-3">
        <Text className="text-sm font-semibold text-gray-800 mb-0.5" numberOfLines={1}>
          {product.item_name || 'Unnamed Product'}
        </Text>
        {product.manufacturer_part_no ? (
          <Text className="text-xs text-gray-500 mb-1" numberOfLines={1}>
            Part #: {product.manufacturer_part_no}
          </Text>
        ) : null}
        {product.description ? (
          <Text className="text-xs text-gray-500 mb-1" numberOfLines={1}>
            {product.description}
          </Text>
        ) : null}
        {product.brand ? (
          <View className="bg-gray-100 rounded px-2 py-0.5 self-start">
            <Text className="text-[10px] text-gray-600 font-medium">{product.brand}</Text>
          </View>
        ) : null}
      </View>

      {/* Column 2: Rate */}
      <View className="w-[90px] items-start pl-1">
        <Text className="text-sm font-semibold text-gray-800">
          {(product.rate ?? 0).toFixed(0)}{' '}
          <Text className="text-xs font-normal text-gray-500">{product.currency || 'SAR'}</Text>
        </Text>
      </View>

      {/* Column 3: Stock */}
      <View className="w-[90px] items-start pl-3">
        <View className={`rounded px-2.5 py-1 items-center min-w-[50px] ${isInStock ? 'bg-green-100' : 'bg-red-100'}`}>
          <Text className={`text-[13px] font-semibold ${isInStock ? 'text-green-700' : 'text-red-600'}`}>
            {stockQty}
          </Text>
          <Text className={`text-[10px] font-normal ml-0.5 ${isInStock ? 'text-green-700' : 'text-red-600'}`}>
            {stockUom}
          </Text>
        </View>
      </View>

      {/* Column 4: Item Code */}
      <View className="w-[140px] pl-4">
        <Text className="text-xs text-gray-600 font-mono" numberOfLines={1}>
          {product.item_code || '-'}
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
