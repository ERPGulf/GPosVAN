import { ProductWithUom } from '@/src/features/products/types/product.types';
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { ProductListItem } from './ProductListItem';

interface ProductListProps {
  products: ProductWithUom[];
  onAddToCart: (product: ProductWithUom) => void;
}

export function ProductList({ products, onAddToCart }: ProductListProps) {
  return (
    <View className="flex-1 bg-white">
      {/* Header Row */}
      <View className="flex-row items-center bg-white border-b border-gray-200 py-[14px] px-5">
        <View className="w-[250px] pr-3">
          <Text className="text-[11px] font-semibold text-gray-400 tracking-[0.5px]">ITEM DETAILS</Text>
        </View>
        <View className="w-[90px] items-start pl-1">
          <Text className="text-[11px] font-semibold text-gray-400 tracking-[0.5px]">RATE</Text>
        </View>
        <View className="w-[90px] items-start pl-3">
          <Text className="text-[11px] font-semibold text-gray-400 tracking-[0.5px]">UOM</Text>
        </View>
        <View className="w-[140px] pl-4">
          <Text className="text-[11px] font-semibold text-gray-400 tracking-[0.5px]">ITEM CODE</Text>
        </View>

        <View className="w-[50px] items-center" />
        {/* Spacer to fill remaining width if any */}
        <View className="flex-1" />
      </View>

      {/* Product List */}
      <FlatList
        data={products}
        keyExtractor={(item, index) => `${item.id}-${item.uomId || index}`}
        renderItem={({ item }) => (
          <ProductListItem product={item} onPress={onAddToCart} />
        )}
        contentContainerClassName="pb-5"
        showsVerticalScrollIndicator={true}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-[60px]">
            <Text className="text-sm text-gray-400">No products found</Text>
          </View>
        }
      />
    </View>
  );
}
