import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { OrderSummary } from '../components/OrderSummary';
import { ProductList } from '../components/ProductList';
import { CartItem } from '../types/cart';
import { MOCK_PRODUCTS, Product } from '../types/product';
import './global.css';

const FILTER_OPTIONS = ['All', 'Consumables', 'Excluded Items', 'Products', 'Woocommerce Products'];

export default function App() {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('All');

  const filteredProducts = MOCK_PRODUCTS.filter((product) => {
    const matchesSearch =
      product.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.manufacturer_part_no.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesFilter = selectedFilter === 'All' || product.item_group === selectedFilter;

    return matchesSearch && matchesFilter;
  });

  const addToCart = (product: Product) => {
    setCartItems((currentItems) => {
      const existingIndex = currentItems.findIndex(
        (item) => item.product.item_code === product.item_code,
      );
      if (existingIndex >= 0) {
        const newItems = [...currentItems];
        newItems[existingIndex].quantity += 1;
        return newItems;
      }
      return [...currentItems, { product, quantity: 1 }];
    });
  };

  const removeFromCart = (index: number) => {
    const newCart = [...cartItems];
    newCart.splice(index, 1);
    setCartItems(newCart);
  };

  const updateQuantity = (index: number, delta: number) => {
    setCartItems((currentItems) => {
      const newItems = [...currentItems];
      const item = newItems[index];
      const newQuantity = item.quantity + delta;

      if (newQuantity <= 0) {
        // Option: Remove item if quantity becomes 0?
        // For now, let's keep it min 1, user can use trash icon to remove.
        if (newQuantity === 0) return currentItems;
        return currentItems;
      }

      item.quantity = newQuantity;
      return newItems;
    });
  };

  return (
    <View className="flex-1 flex-row bg-white">
      {/* Left Column: Products */}
      <View className="flex-1 flex-col border-r border-gray-200">
        {/* Search Header */}
        <View className="flex-col p-4 border-b border-gray-200 bg-white shadow-sm z-10 gap-4">
          <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-1 border border-gray-200">
            <Ionicons name="search" size={20} color="#9ca3af" />
            <TextInput
              className="flex-1 ml-3 text-gray-800 text-base"
              placeholder="Search by Name, Part Number, or Item Code..."
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9ca3af"
            />
          </View>

          {/* Filter Chips */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-row">
            {FILTER_OPTIONS.map((filter) => (
              <TouchableOpacity
                key={filter}
                onPress={() => setSelectedFilter(filter)}
                className={`px-4 py-2 rounded-full mr-2 border ${selectedFilter === filter
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}>
                <Text
                  className={`font-medium text-sm ${selectedFilter === filter ? 'text-white' : 'text-gray-600'
                    }`}>
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Product List */}
        <ProductList products={filteredProducts} onAddToCart={addToCart} />
      </View>

      {/* Right Column: Order Summary */}
      <View className="w-1/3 h-full shadow-xl">
        <OrderSummary
          cartItems={cartItems}
          onRemoveItem={removeFromCart}
          onUpdateQuantity={updateQuantity}
        />
      </View>
    </View>
  );
}
