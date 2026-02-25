import { addToCart, removeFromCart, selectCartItems, updateQuantity } from '@/src/features/cart/cartSlice';
import { OrderSummary } from '@/src/features/orders/components/OrderSummary';
import { ProductList } from '@/src/features/products/components/ProductList';
import { useBarcodes, useCategories, useProducts } from '@/src/features/products/hooks/useProducts';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
;

export default function App() {
    const { data: dbProducts, isLoading, error } = useProducts();
    const { data: categories } = useCategories();
    const dispatch = useAppDispatch();
    const cartItems = useAppSelector(selectCartItems);
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

    const { data: barcodeData } = useBarcodes();

    // Build a lookup: "productId-uom" → list of barcode strings
    const barcodeMap = useMemo(() => {
        const map = new Map<string, string[]>();
        barcodeData?.forEach((bc) => {
            if (bc.productId != null && bc.barCode) {
                const key = `${bc.productId}-${bc.uom || ''}`;
                const existing = map.get(key) || [];
                existing.push(bc.barCode.toLowerCase());
                map.set(key, existing);
            }
        });
        return map;
    }, [barcodeData]);

    // Filter products using name, itemCode, and barcode
    const filteredProducts = useMemo(() => {
        if (!dbProducts) return [];
        return dbProducts.filter((product) => {
            const name = product.name?.toLowerCase() || '';
            const itemCode = product.itemCode?.toLowerCase() || '';
            const query = searchQuery.toLowerCase();

            // Check name and item code
            const matchesNameOrCode = name.includes(query) || itemCode.includes(query);

            // Check barcodes for this product+uom
            const barcodeKey = `${product.id}-${product.uom || ''}`;
            const productBarcodes = barcodeMap.get(barcodeKey) || [];
            const matchesBarcode = productBarcodes.some((bc) => bc === query);

            const matchesSearch = matchesNameOrCode || matchesBarcode;

            const matchesFilter =
                selectedFilter === 'All' ||
                (product.categoryId ? categoryNameMap.get(product.categoryId) === selectedFilter : false);

            return matchesSearch && matchesFilter;
        });
    }, [dbProducts, searchQuery, selectedFilter, categoryNameMap, barcodeMap]);

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
                            placeholder="Search by Name, Item Code, or Barcode..."
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
                    <ProductList products={filteredProducts} onAddToCart={(product) => dispatch(addToCart(product))} />
                )}
            </View>

            {/* Right Column: Order Summary */}
            <View className="w-1/3 h-full shadow-xl">
                <OrderSummary
                    cartItems={cartItems}
                    onRemoveItem={(index) => dispatch(removeFromCart(index))}
                    onUpdateQuantity={(index, delta) => dispatch(updateQuantity({ index, delta }))}
                    onCheckout={() => router.push('/checkout')}
                />
            </View>
        </View>
    );
}
