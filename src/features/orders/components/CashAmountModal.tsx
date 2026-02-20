import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface CashAmountModalProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (amount: string) => void;
    totalAmount: number;
    initialAmount?: string;
}

export function CashAmountModal({ visible, onClose, onSubmit, totalAmount, initialAmount = '' }: CashAmountModalProps) {
    const [amount, setAmount] = useState(initialAmount);

    useEffect(() => {
        if (visible) {
            setAmount(initialAmount);
        }
    }, [visible, initialAmount]);

    const handleSubmit = () => {
        onSubmit(amount);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="fade" transparent>
            <View className="flex-1 bg-black/50 justify-center items-center p-4">
                <View className="bg-white rounded-2xl w-full max-w-sm">
                    {/* Header */}
                    <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
                        <Text className="text-xl font-bold text-gray-800">Enter Cash Amount</Text>
                        <Pressable onPress={onClose} className="p-2">
                            <Ionicons name="close" size={24} color="#6b7280" />
                        </Pressable>
                    </View>

                    {/* Content */}
                    <View className="p-6">
                        <Text className="text-gray-500 mb-4 text-center">
                            Total to pay: <Text className="font-bold text-gray-800">{totalAmount.toFixed(2)}</Text>
                        </Text>

                        <TextInput
                            className="bg-gray-50 border border-gray-300 rounded-xl p-4 text-3xl text-center font-bold text-gray-800 mb-6"
                            keyboardType="numeric"
                            placeholder="0.00"
                            placeholderTextColor="#9ca3af"
                            value={amount}
                            onChangeText={(text) => {
                                const cleaned = text.replace(/[^0-9.]/g, '');
                                const cash = parseFloat(cleaned) || 0;
                                if (cash <= totalAmount || text === '') {
                                    setAmount(cleaned);
                                }
                            }}
                            autoFocus={true}
                        />

                        <View className="flex-row gap-3 mt-2">
                            <TouchableOpacity
                                className="flex-1 py-3 rounded-xl bg-gray-200 items-center justify-center"
                                onPress={onClose}
                            >
                                <Text className="font-semibold text-gray-700 text-lg">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className="flex-1 py-3 rounded-xl bg-green-500 items-center justify-center"
                                onPress={handleSubmit}
                            >
                                <Text className="font-semibold text-white text-lg">Confirm</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
}
