import { useCart } from '@/src/features/cart/context/CartContext';
import { AddCustomerModal } from '@/src/features/customers/components/AddCustomerModal';
import { useCustomers } from '@/src/features/customers/hooks/useCustomers';
import { OrderSummary } from '@/src/features/orders/components/OrderSummary';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type PaymentMethod = 'Card' | 'Cash' | 'Mobile';

interface SelectedCustomer {
    id: string;
    name: string | null;
    phoneNo: string | null;
}

export default function CheckoutPage() {
    const router = useRouter();
    const { cartItems, removeFromCart, updateQuantity, clearCart, getTotal } = useCart();
    const { data: customers } = useCustomers();

    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('Card');
    const [isAddCustomerModalVisible, setIsAddCustomerModalVisible] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
    const [customerSearch, setCustomerSearch] = useState('');

    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        if (!customerSearch.trim()) return customers;
        const term = customerSearch.toLowerCase();
        return customers.filter(
            (c) =>
                c.name?.toLowerCase().includes(term) ||
                c.phoneNo?.toLowerCase().includes(term)
        );
    }, [customers, customerSearch]);

    const handleSelectCustomer = (customer: SelectedCustomer) => {
        setSelectedCustomer(customer);
        setIsDropdownOpen(false);
        setCustomerSearch('');
    };

    const handleCompletePayment = () => {
        console.log('Complete Payment', {
            paymentMethod: selectedPaymentMethod,
            customer: selectedCustomer,
            total: getTotal(),
            items: cartItems,
        });
        alert('Payment Completed! (Mock)');
        clearCart();
        router.replace('/');
    };

    const handleSaveAndClear = () => {
        console.log('Save and Clear');
        clearCart();
        router.replace('/');
    };

    return (
        <View className="flex-1 flex-row bg-gray-50">
            {/* Left Column: Actions */}
            <ScrollView className="flex-1 p-6">
                <View>
                    <Text className="text-2xl font-bold text-gray-800 mb-6">Checkout</Text>

                    {/* Select Customer Section */}
                    <View className="mb-8" style={{ zIndex: 10 }}>
                        <Text className="text-gray-600 font-medium mb-2">Select Customer</Text>

                        {/* Dropdown Trigger */}
                        <TouchableOpacity
                            onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex-row items-center justify-between bg-white border border-gray-200 rounded-lg p-4"
                        >
                            {selectedCustomer ? (
                                <View className="flex-row items-center flex-1">
                                    <View className="w-8 h-8 rounded-full bg-green-100 items-center justify-center mr-3">
                                        <Ionicons name="person" size={16} color="#22c55e" />
                                    </View>
                                    <View>
                                        <Text className="text-gray-800 font-medium">{selectedCustomer.name}</Text>
                                        {selectedCustomer.phoneNo && (
                                            <Text className="text-gray-400 text-xs">{selectedCustomer.phoneNo}</Text>
                                        )}
                                    </View>
                                </View>
                            ) : (
                                <Text className="text-gray-400">Select a customer</Text>
                            )}
                            <Ionicons
                                name={isDropdownOpen ? 'chevron-up' : 'chevron-down'}
                                size={20}
                                color="#9ca3af"
                            />
                        </TouchableOpacity>

                        {/* Dropdown List */}
                        {isDropdownOpen && (
                            <View
                                className="bg-white border border-gray-200 rounded-lg mt-1 shadow-lg"
                                style={{ maxHeight: 280 }}
                            >
                                {/* Search Input */}
                                <View className="flex-row items-center px-3 py-2 border-b border-gray-100">
                                    <Ionicons name="search" size={16} color="#9ca3af" />
                                    <TextInput
                                        className="flex-1 ml-2 text-sm text-gray-800"
                                        placeholder="Search by name or phone..."
                                        placeholderTextColor="#9ca3af"
                                        value={customerSearch}
                                        onChangeText={setCustomerSearch}
                                        autoFocus
                                    />
                                </View>

                                {/* Scrollable Customer List */}
                                <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
                                    {filteredCustomers.length === 0 ? (
                                        <View className="items-center py-6">
                                            <Text className="text-gray-400 text-sm">No customers found</Text>
                                        </View>
                                    ) : (
                                        filteredCustomers.map((customer) => (
                                            <TouchableOpacity
                                                key={customer.id}
                                                onPress={() =>
                                                    handleSelectCustomer({
                                                        id: customer.id,
                                                        name: customer.name,
                                                        phoneNo: customer.phoneNo,
                                                    })
                                                }
                                                className={`flex-row items-center px-4 py-3 border-b border-gray-50 ${selectedCustomer?.id === customer.id
                                                        ? 'bg-green-50'
                                                        : ''
                                                    }`}
                                            >
                                                <View className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center mr-3">
                                                    <Ionicons name="person-outline" size={16} color="#6b7280" />
                                                </View>
                                                <View className="flex-1">
                                                    <Text className="text-gray-800 text-sm font-medium">
                                                        {customer.name || 'Unnamed'}
                                                    </Text>
                                                    {customer.phoneNo && (
                                                        <Text className="text-gray-400 text-xs">
                                                            {customer.phoneNo}
                                                        </Text>
                                                    )}
                                                </View>
                                                {selectedCustomer?.id === customer.id && (
                                                    <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                                                )}
                                            </TouchableOpacity>
                                        ))
                                    )}
                                </ScrollView>

                                {/* Add New Customer Button (pinned at bottom) */}
                                <TouchableOpacity
                                    onPress={() => {
                                        setIsDropdownOpen(false);
                                        setIsAddCustomerModalVisible(true);
                                    }}
                                    className="flex-row items-center px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg"
                                >
                                    <View className="w-8 h-8 rounded-full bg-green-500 items-center justify-center mr-3">
                                        <Ionicons name="add" size={18} color="white" />
                                    </View>
                                    <Text className="text-green-600 font-semibold text-sm">
                                        Add a new customer
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    {/* Payment Method Section */}
                    <View>
                        <Text className="text-gray-600 font-medium mb-3">Select Payment Method</Text>
                        <View className="gap-3">
                            <PaymentMethodOption
                                icon="card-outline"
                                title="Card Payment"
                                subtitle="Process payment using credit or debit card"
                                isSelected={selectedPaymentMethod === 'Card'}
                                onPress={() => setSelectedPaymentMethod('Card')}
                                color="#3b82f6"
                                bgIcon="bg-blue-100"
                            />
                            <PaymentMethodOption
                                icon="cash-outline"
                                title="Cash Payment"
                                subtitle="Process payment using cash"
                                isSelected={selectedPaymentMethod === 'Cash'}
                                onPress={() => setSelectedPaymentMethod('Cash')}
                                color="#22c55e"
                                bgIcon="bg-green-100"
                            />
                            <PaymentMethodOption
                                icon="phone-portrait-outline"
                                title="Mobile Payment"
                                subtitle="Process payment using mobile wallet"
                                isSelected={selectedPaymentMethod === 'Mobile'}
                                onPress={() => setSelectedPaymentMethod('Mobile')}
                                color="#a855f7"
                                bgIcon="bg-purple-100"
                            />
                        </View>
                    </View>
                </View>
            </ScrollView>

            {/* Right Column: Order Summary */}
            <View className="w-1/3 h-full bg-white shadow-xl flex-col">
                <View className="flex-1">
                    <OrderSummary
                        cartItems={cartItems}
                        onRemoveItem={removeFromCart}
                        onUpdateQuantity={updateQuantity}
                        onCheckout={() => { }}
                        showActions={false}
                    />
                </View>

                {/* Custom Actions for Checkout Page */}
                <View className="p-4 bg-gray-50 border-t border-gray-200 gap-3">
                    <TouchableOpacity
                        onPress={handleCompletePayment}
                        className="w-full bg-green-500 py-4 rounded-xl items-center flex-row justify-center"
                    >
                        <Text className="text-white font-bold text-lg mr-2">Complete Payment</Text>
                        <Ionicons name="chevron-forward" size={20} color="white" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleSaveAndClear}
                        className="w-full bg-gray-200 py-3 rounded-xl items-center flex-row justify-center"
                    >
                        <Ionicons name="save-outline" size={20} color="#374151" style={{ marginRight: 8 }} />
                        <Text className="text-gray-700 font-semibold">Save and Clear</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => router.back()}
                        className="w-full bg-gray-100 py-3 rounded-xl items-center flex-row justify-center"
                    >
                        <Ionicons name="arrow-back" size={20} color="#374151" style={{ marginRight: 8 }} />
                        <Text className="text-gray-700 font-semibold">Back to Menu</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Modals */}
            <AddCustomerModal
                visible={isAddCustomerModalVisible}
                onClose={() => setIsAddCustomerModalVisible(false)}
                onSuccess={() => {
                    // After creating a new customer, the useCustomers query will refetch
                }}
            />
        </View>
    );
}

function PaymentMethodOption({
    icon,
    title,
    subtitle,
    isSelected,
    onPress,
    color,
    bgIcon,
}: {
    icon: any;
    title: string;
    subtitle: string;
    isSelected: boolean;
    onPress: () => void;
    color: string;
    bgIcon: string;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            className={`flex-row items-center p-4 rounded-xl border ${isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
                }`}
        >
            <View className={`w-12 h-12 rounded-full items-center justify-center mr-4 ${bgIcon}`}>
                <Ionicons name={icon} size={24} color={color} />
            </View>
            <View className="flex-1">
                <Text className="text-gray-800 font-bold text-base">{title}</Text>
                <Text className="text-gray-500 text-sm">{subtitle}</Text>
            </View>
            {isSelected && (
                <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
            )}
        </TouchableOpacity>
    );
}
