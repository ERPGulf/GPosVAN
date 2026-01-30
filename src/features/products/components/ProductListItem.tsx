import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Product } from '../types/product';

interface ProductListItemProps {
    product: Product;
    onPress: (product: Product) => void;
}

export function ProductListItem({ product, onPress }: ProductListItemProps) {
    return (
        <TouchableOpacity
            className="flex-row items-center border-b border-gray-100 py-3 px-4 bg-white active:bg-gray-50 hover:bg-gray-50"
            onPress={() => onPress(product)}>
            {/* Column 1: Item Name & Description */}
            <View className="flex-1 pr-4">
                <Text className="text-sm font-semibold text-gray-800" numberOfLines={1}>
                    {product.item_name}
                </Text>
                <Text className="text-xs text-gray-500" numberOfLines={1}>
                    {product.description}
                </Text>
                <View className="flex-row items-center mt-1">
                    <View className="bg-gray-100 rounded px-1.5 py-0.5 mr-2">
                        <Text className="text-[10px] text-gray-600 font-medium">{product.brand}</Text>
                    </View>
                </View>
            </View>

            {/* Column 2: Rate */}
            <View className="w-24 items-end justify-center pr-4">
                <Text className="text-sm font-bold text-gray-800">
                    {product.rate}{' '}
                    <Text className="text-xs font-normal text-gray-500">{product.currency}</Text>
                </Text>
            </View>

            {/* Column 3: Available Qty */}
            <View className="w-20 items-center justify-center pr-4">
                <View
                    className={`rounded-full px-2 py-0.5 ${product.actual_qty > 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                    <Text
                        className={`text-xs font-medium ${product.actual_qty > 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {product.actual_qty} {product.stock_uom}
                    </Text>
                </View>
            </View>

            {/* Column 4: Item Code */}
            <View className="w-32 justify-center pr-4">
                <Text className="text-xs font-medium text-gray-600 font-mono">{product.item_code}</Text>
            </View>

            {/* Column 5: Part Number */}
            <View className="w-32 justify-center">
                <Text className="text-xs text-gray-500">{product.manufacturer_part_no}</Text>
            </View>

            {/* Add Button Action */}
            <View className="w-12 items-center justify-center pl-2">
                <Ionicons name="add-circle-outline" size={24} color="#22c55e" />
            </View>
        </TouchableOpacity>
    );
}
