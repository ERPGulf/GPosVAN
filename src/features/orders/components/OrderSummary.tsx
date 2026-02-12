import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CartItem } from '../../cart/types';


interface OrderSummaryProps {
  cartItems: CartItem[];
  onRemoveItem: (index: number) => void;
  onUpdateQuantity: (index: number, delta: number) => void;
  onCheckout: () => void;
  showActions?: boolean;
}

export function OrderSummary({ cartItems, onRemoveItem, onUpdateQuantity, onCheckout, showActions = true }: OrderSummaryProps) {
  const subtotal = cartItems.reduce((sum, item) => sum + item.product.rate * item.quantity, 0);
  const tax = subtotal * 0.15; // Assuming 15% VAT
  const total = subtotal + tax;

  return (
    // <View className="flex-col h-full bg-white border-l border-gray-200">
    //   <View className="p-4 border-b border-gray-100">
    //     <Text className="text-lg font-bold text-gray-800">Current Order</Text>
    //   </View>

    //   <ScrollView className="flex-1 p-4">
    //     {cartItems.length === 0 ? (
    //       <View className="items-center justify-center py-10">
    //         <Text className="text-gray-400">No items added</Text>
    //       </View>
    //     ) : (
    //       cartItems.map((item, index) => (
    //         <View
    //           key={`${item.product.item_code}-${index}`}
    //           className="flex-row items-center justify-between mb-4 bg-gray-50 p-4 rounded-xl">
    //           <View className="flex-1 pr-2">
    //             <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
    //               {item.product.item_name}
    //             </Text>
    //             <Text className="text-xs text-gray-500">{item.product.item_code}</Text>
    //             <Text className="text-sm text-gray-600 mt-1">
    //               {item.product.rate} {item.product.currency}
    //             </Text>
    //           </View>

    //           <View className="items-end gap-2">
    //             <Text className="text-sm font-bold">
    //               {(item.product.rate * item.quantity).toFixed(2)}
    //             </Text>

    //             <View className="flex-row items-center bg-white rounded-xl border border-gray-200 p-1">
    //               <TouchableOpacity onPress={() => onUpdateQuantity(index, -1)} className="p-1">
    //                 <Ionicons name="remove" size={16} color="#4b5563" />
    //               </TouchableOpacity>

    //               <Text className="mx-2 font-medium w-4 text-center">{item.quantity}</Text>

    //               <TouchableOpacity onPress={() => onUpdateQuantity(index, 1)} className="p-1">
    //                 <Ionicons name="add" size={16} color="#4b5563" />
    //               </TouchableOpacity>
    //             </View>
    //           </View>

    //           <TouchableOpacity onPress={() => onRemoveItem(index)} className="ml-2 p-1">
    //             <Ionicons name="trash-outline" size={18} color="#ef4444" />
    //           </TouchableOpacity>
    //         </View>
    //       ))
    //     )}
    //   </ScrollView>

    //   <View className="p-4 bg-gray-50 border-t border-gray-200">
    //     <View className="flex-row justify-between mb-2">
    //       <Text className="text-gray-500">Subtotal</Text>
    //       <Text className="font-medium">{subtotal.toFixed(2)}</Text>
    //     </View>
    //     <View className="flex-row justify-between mb-4">
    //       <Text className="text-gray-500">Tax (15%)</Text>
    //       <Text className="font-medium">{tax.toFixed(2)}</Text>
    //     </View>
    //     <View className="flex-row justify-between mb-6 pt-4 border-t border-gray-200">
    //       <Text className="text-lg font-bold">Total</Text>
    //       <Text className="text-lg font-bold">{total.toFixed(2)}</Text>
    //     </View>

    //     <View className="flex-row gap-3">
    //       <TouchableOpacity className="flex-1 bg-gray-200 py-3 rounded-xl items-center">
    //         <Text className="font-semibold text-gray-700">Save</Text>
    //       </TouchableOpacity>
    //       <TouchableOpacity className="flex-1 bg-green-500 py-3 rounded-xl items-center">
    //         <Text className="font-semibold text-white">Checkout</Text>
    //       </TouchableOpacity>
    //     </View>
    //   </View>
    // </View>
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
          cartItems.map((item, index) => (
            <View
              key={`${item.product.item_code}-${index}`}
              className="flex-row items-center justify-between mb-4 bg-gray-50 p-3 rounded-lg">
              <View className="flex-1 pr-2">
                <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
                  {item.product.item_name}
                </Text>
                <Text className="text-xs text-gray-500">{item.product.item_code}</Text>
                <Text className="text-sm text-gray-600 mt-1">
                  {item.product.rate} {item.product.currency}
                </Text>
              </View>

              <View className="items-end gap-2">
                <Text className="text-sm font-bold">
                  {(item.product.rate * item.quantity).toFixed(2)}
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
          ))
        )}
      </ScrollView>

      <View className="p-4 bg-gray-50 border-t border-gray-200">
        <View className="flex-row justify-between mb-2">
          <Text className="text-gray-500">Subtotal</Text>
          <Text className="font-medium">{subtotal.toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between mb-4">
          <Text className="text-gray-500">Tax (15%)</Text>
          <Text className="font-medium">{tax.toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between mb-6 pt-4 border-t border-gray-200">
          <Text className="text-lg font-bold">Total</Text>
          <Text className="text-lg font-bold">{total.toFixed(2)}</Text>
        </View>

        {showActions && (
          <View className="flex-row gap-3">
            <TouchableOpacity className="flex-1 bg-gray-200 py-3 rounded-xl items-center">
              <Text className="font-semibold text-gray-700">Save</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onCheckout} className="flex-1 bg-green-500 py-3 rounded-xl items-center">
              <Text className="font-semibold text-white">Checkout</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}
