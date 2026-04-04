import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

interface CloseShiftModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit?: (cash: number, card: number) => void;
}

export function CloseShiftModal({ visible, onClose, onSubmit }: CloseShiftModalProps) {
  const [cashAmount, setCashAmount] = useState<string>('');
  const [cardAmount, setCardAmount] = useState<string>('');

  const handleConfirm = () => {
    const cash = parseFloat(cashAmount) || 0;
    const card = parseFloat(cardAmount) || 0;
    
    console.log('Closing Shift Data: ', { cash, card });
    
    if (onSubmit) {
      onSubmit(cash, card);
    }

    // Reset inputs
    setCashAmount('');
    setCardAmount('');
    onClose();
  };

  const handleClose = () => {
    setCashAmount('');
    setCardAmount('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50 px-6">
        <View className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <View className="flex-row justify-between items-center bg-red-500 px-6 py-5">
            <View>
              <Text className="text-white text-xl font-bold">Close Shift</Text>
              <Text className="text-red-100 text-sm mt-1">
                Enter your closing amounts
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} className="p-1">
              <Ionicons name="close" size={24} color="white" />
            </TouchableOpacity>
          </View>

          {/* Input Form */}
          <View className="px-6 py-6">
            {/* Cash Input */}
            <View className="mb-5">
              <Text className="text-gray-700 font-semibold mb-2 ml-1">Closing Cash</Text>
              <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4">
                <Ionicons name="cash-outline" size={20} color="#9ca3af" />
                <TextInput
                  className="flex-1 px-3 py-3 text-gray-800 text-base"
                  placeholder="0.00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  value={cashAmount}
                  onChangeText={setCashAmount}
                />
              </View>
            </View>

            {/* Card Input */}
            <View className="mb-5">
              <Text className="text-gray-700 font-semibold mb-2 ml-1">Closing Card</Text>
              <View className="flex-row items-center bg-gray-50 border border-gray-200 rounded-xl px-4">
                <Ionicons name="card-outline" size={20} color="#9ca3af" />
                <TextInput
                  className="flex-1 px-3 py-3 text-gray-800 text-base"
                  placeholder="0.00"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                  value={cardAmount}
                  onChangeText={setCardAmount}
                />
              </View>
            </View>

            {/* Confirm Button */}
            <TouchableOpacity
              onPress={handleConfirm}
              className="w-full py-4 rounded-xl items-center justify-center bg-red-500 shadow-sm mt-2"
            >
              <Text className="text-white font-bold text-base">
                Confirm Closing Amounts
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
