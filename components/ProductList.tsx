import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { Product } from '../types/product';
import { ProductListItem } from './ProductListItem';

interface ProductListProps {
  products: Product[];
  onAddToCart: (product: Product) => void;
}

export function ProductList({ products, onAddToCart }: ProductListProps) {
  return (
    <View className="flex-1 bg-white">
      {/* Header Row */}
      <View className="flex-row items-center border-b border-gray-200 bg-gray-50 py-3 px-4">
        <View className="flex-1 pr-4">
          <Text className="text-xs font-semibold text-gray-500 uppercase">Item Details</Text>
        </View>
        <View className="w-24 pr-4 items-end">
          <Text className="text-xs font-semibold text-gray-500 uppercase">Rate</Text>
        </View>
        <View className="w-20 pr-4 items-center">
          <Text className="text-xs font-semibold text-gray-500 uppercase">Stock</Text>
        </View>
        <View className="w-32 pr-4">
          <Text className="text-xs font-semibold text-gray-500 uppercase">Item Code</Text>
        </View>
        <View className="w-32">
          <Text className="text-xs font-semibold text-gray-500 uppercase">Part No</Text>
        </View>
        <View className="w-12 pl-2">{/* Action Header empty */}</View>
      </View>

      <FlatList
        data={products}
        keyExtractor={(item) => item.item_code}
        renderItem={({ item }) => <ProductListItem product={item} onPress={onAddToCart} />}
        contentContainerStyle={{ paddingBottom: 20 }}
        showsVerticalScrollIndicator={true}
      />
    </View>
  );
}
