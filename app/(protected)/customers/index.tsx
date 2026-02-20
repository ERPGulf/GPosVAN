import { AddCustomerModal } from '@/src/features/customers/components/AddCustomerModal';
import { useCustomers } from '@/src/features/customers/hooks/useCustomers';
import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    TextInput,
    View
} from 'react-native';

export default function CustomersPage() {
    const { data: customers, isLoading, error } = useCustomers();
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalVisible, setIsModalVisible] = useState(false);

    // Filter customers based on search query
    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        if (!searchQuery.trim()) return customers;

        const query = searchQuery.toLowerCase();
        return customers.filter(
            (customer) =>
                customer.name?.toLowerCase().includes(query) ||
                customer.phoneNo?.toLowerCase().includes(query) ||
                customer.vatNumber?.toLowerCase().includes(query)
        );
    }, [customers, searchQuery]);

    // Table header component
    const TableHeader = () => (
        <View className="flex-row bg-gray-100 border-b border-gray-200 px-4 py-3">
            <Text className="flex-1 font-semibold text-gray-700 text-sm">Name</Text>
            <Text className="w-56 font-semibold text-gray-700 text-sm">Phone</Text>
            <Text className="w-56 font-semibold text-gray-700 text-sm">VAT Number</Text>
            {/* <Text className="w-52 font-semibold text-gray-700 text-sm">Group</Text> */}
            <Text className="w-40 font-semibold text-gray-700 text-sm text-center">Status</Text>
            <Text className="w-24 font-semibold text-gray-700 text-sm text-center">Sync</Text>
        </View>
    );

    // Table row component
    const TableRow = ({ item, index }: { item: typeof filteredCustomers[0]; index: number }) => (
        <View
            className={`flex-row px-4 py-3  border-b border-gray-100 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                }`}
        >
            <Text className="flex-1 text-gray-800 text-sm" numberOfLines={1}>
                {item.name || '-'}
            </Text>
            <Text className="w-56 text-gray-600 text-sm" numberOfLines={1}>
                {item.phoneNo || '-'}
            </Text>
            <Text className="w-56 text-gray-600 text-sm" numberOfLines={1}>
                {item.vatNumber || '-'}
            </Text>
            {/* <Text className="w-52 text-gray-600 text-sm" numberOfLines={1}>
                {item.customerGroup || '-'}
            </Text> */}
            <View className="w-40 items-center">
                <View
                    className={`px-2 py-1 rounded-full ${item.isDisabled ? 'bg-red-100' : 'bg-green-100'
                        }`}
                >
                    <Text
                        className={`text-xs font-medium ${item.isDisabled ? 'text-red-600' : 'text-green-600'
                            }`}
                    >
                        {item.isDisabled ? 'Disabled' : 'Active'}
                    </Text>
                </View>
            </View>
            <View className="w-24 items-center">
                {item.syncStatus === 'synced' ? (
                    <Ionicons name="checkmark-circle" size={18} color="#22c55e" />
                ) : item.syncStatus === 'pending' ? (
                    <Ionicons name="time-outline" size={18} color="#f59e0b" />
                ) : (
                    <Ionicons name="alert-circle" size={18} color="#ef4444" />
                )}
            </View>
        </View>
    );

    if (isLoading) {
        return (
            <View className="flex-1 items-center justify-center bg-white">
                <ActivityIndicator size="large" color="#22c55e" />
                <Text className="mt-4 text-gray-500">Loading customers...</Text>
            </View>
        );
    }

    if (error) {
        return (
            <View className="flex-1 items-center justify-center bg-white p-4">
                <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
                <Text className="mt-4 text-red-500 text-center">
                    Failed to load customers. Please try again.
                </Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-white">
            {/* Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
                <View className="flex-row items-center gap-2">
                    <Text className="text-xl font-bold text-gray-800 border-r-2 pr-2 border-gray-200">Customers</Text>
                    <Text className="text-gray-500 text-sm">
                        {filteredCustomers.length} customer{filteredCustomers.length !== 1 ? 's' : ''}
                    </Text>
                </View>
                <Pressable
                    onPress={() => setIsModalVisible(true)}
                    className="flex-row items-center bg-green-500 px-4 py-2 rounded-lg active:bg-green-600"
                >
                    <Ionicons name="add" size={20} color="#ffffff" />
                    <Text className="text-white font-semibold ml-2">Add new Customer</Text>
                </Pressable>
            </View>

            {/* Search Bar */}
            <View className="p-4 border-b border-gray-200">
                <View className="flex-row items-center bg-gray-100 rounded-xl px-4 py-2 border border-gray-200">
                    <Ionicons name="search" size={20} color="#9ca3af" />
                    <TextInput
                        className="flex-1 ml-3 text-gray-800 text-base"
                        placeholder="Search by name, phone, or VAT number..."
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        placeholderTextColor="#9ca3af"
                    />
                </View>
            </View>

            {/* Table */}
            <View className="flex-1 m-3">
                <TableHeader />
                {filteredCustomers.length === 0 ? (
                    <View className="flex-1 items-center justify-center p-8">
                        <Ionicons name="people-outline" size={48} color="#9ca3af" />
                        <Text className="mt-4 text-gray-500 text-center">
                            {searchQuery ? 'No customers match your search' : 'No customers found'}
                        </Text>
                    </View>
                ) : (
                    <FlatList
                        data={filteredCustomers}
                        keyExtractor={(item) => item.id}
                        renderItem={({ item, index }) => <TableRow item={item} index={index} />}
                        showsVerticalScrollIndicator={true}
                    />
                )}
            </View>
            {/* Add Customer Modal */}
            <AddCustomerModal
                visible={isModalVisible}
                onClose={() => setIsModalVisible(false)}
            />
        </View>
    );
}
