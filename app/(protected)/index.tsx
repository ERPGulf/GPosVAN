import { useCart } from '@/src/features/cart/context/CartContext';
import { OrderSummary } from '@/src/features/orders/components/OrderSummary';
import { ProductList } from '@/src/features/products/components/ProductList';
import { useCategories, useProducts } from '@/src/features/products/hooks/useProducts';
import { Product } from '@/src/features/products/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function App() {
    const { data: dbProducts, isLoading, error } = useProducts();
    const { data: categories } = useCategories();
    // const [cartItems, setCartItems] = useState<CartItem[]>([]); // Removed local state
    const { cartItems, addToCart, removeFromCart, updateQuantity } = useCart(); // Use global context
    const router = useRouter();

    const [searchQuery, setSearchQuery] = useState('');
    const [selectedFilter, setSelectedFilter] = useState('All');

    // Build filter options from categories
    const filterOptions = useMemo(() => {
        const categoryNames = categories
            ?.map((cat) => cat.name)
            .filter((name): name is string => Boolean(name)) || [];
        return ['All', ...categoryNames];
    }, [categories]);

    // Create a lookup map for category ID to name
    const categoryNameMap = useMemo(() => {
        const map = new Map<string, string>();
        categories?.forEach((cat) => {
            if (cat.id && cat.name) {
                map.set(cat.id, cat.name);
            }
        });
        return map;
    }, [categories]);

    // Map database products to the UI Product format
    const products: Product[] = useMemo(() => {
        if (!dbProducts) return [];
        return dbProducts.map((p) => ({
            item_code: p.itemCode || '',
            item_name: p.name || '',
            description: '',
            stock_uom: '',
            image: null,
            is_stock_item: 1,
            has_variants: 0,
            variant_of: null,
            item_group: p.categoryId ? categoryNameMap.get(p.categoryId) || '' : '',
            idx: 0,
            has_batch_no: 0,
            has_serial_no: 0,
            max_discount: 0,
            brand: '',
            manufacturer_part_no: '',
            rate: p.price || 0,
            currency: 'SAR',
            item_barcode: [],
            actual_qty: 0,
            serial_no_data: [],
            batch_no_data: [],
            attributes: '',
            item_attributes: '',
            item_manufacturer_part_no: '',
            alternative_items: [],
            wholesale_rate: 0,
            wholesale_rate2: 0,
            wholesale_rate3: '0.000000000',
        }));
    }, [dbProducts, categoryNameMap]);

    const filteredProducts = products.filter((product) => {
        const matchesSearch =
            product.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.item_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
            product.manufacturer_part_no.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesFilter = selectedFilter === 'All' || product.item_group === selectedFilter;

        return matchesSearch && matchesFilter;
    });

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
                        {filterOptions.map((filter) => (
                            <TouchableOpacity
                                key={filter}
                                onPress={() => setSelectedFilter(filter)}
                                className={`px-4 py-2 rounded-full mr-2 border ${selectedFilter === filter
                                    ? 'bg-green-500 border-green-500'
                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                                    } `}>
                                <Text
                                    className={`font-medium text-sm ${selectedFilter === filter ? 'text-white' : 'text-gray-600'
                                        } `}>
                                    {filter}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Product List */}
                {isLoading ? (
                    <View className="flex-1 items-center justify-center">
                        <ActivityIndicator size="large" color="#22c55e" />
                        <Text className="mt-4 text-gray-500">Loading products...</Text>
                    </View>
                ) : error ? (
                    <View className="flex-1 items-center justify-center p-4">
                        <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
                        <Text className="mt-4 text-red-500 text-center">
                            Failed to load products. Please try again.
                        </Text>
                    </View>
                ) : (
                    <ProductList products={filteredProducts} onAddToCart={addToCart} />
                )}
            </View>

            {/* Right Column: Order Summary */}
            <View className="w-1/3 h-full shadow-xl">
                <OrderSummary
                    cartItems={cartItems}
                    onRemoveItem={removeFromCart}
                    onUpdateQuantity={updateQuantity}
                    onCheckout={() => router.push('/checkout')}
                />
            </View>
        </View>
    );
}
