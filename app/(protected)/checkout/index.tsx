import {
  clearCart,
  removeFromCart,
  selectCartItems,
  selectTotal,
  updateQuantity,
} from '@/src/features/cart/cartSlice';
import { AddCustomerModal } from '@/src/features/customers/components/AddCustomerModal';
import { useCustomers } from '@/src/features/customers/hooks/useCustomers';
import { CashAmountModal } from '@/src/features/orders/components/CashAmountModal';
import { OrderSummary } from '@/src/features/orders/components/OrderSummary';
import { InvoiceQR } from '@/src/features/zatca/components/InvoiceQR';
import { useCreateInvoice } from '@/src/features/zatca/hooks/useCreateInvoice';
import {
  getZatcaConfig,
  hydrateZatcaConfigFromStorage,
  setZatcaConfigFromBackend,
} from '@/src/features/zatca/services/zatcaConfig';
import { TEST_ZATCA_SETTINGS_PAYLOAD } from '@/src/features/zatca/services/zatcaTestPayload';
import type { InvoiceParams } from '@/src/features/zatca/types';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type PaymentMethod = 'Cash/Card' | 'Cash' | 'Card';

interface SelectedCustomer {
  id: string;
  name: string | null;
  phoneNo: string | null;
  taxId?: string | null;
  registrationNo?: string | null;
  registrationType?: string | null;
  addressLine1?: string | null;
  city?: string | null;
}

const PIH_STORAGE_KEY = '@zatca_pih';

interface GeneratedInvoiceState {
  xml: string;
  qrData: string;
  invoiceHash: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const cartItems = useAppSelector(selectCartItems);
  const total = useAppSelector(selectTotal);
  const { data: customers } = useCustomers();
  const { create: createZatcaInvoice, isLoading: isCreatingInvoice } = useCreateInvoice();

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('Cash');
  const [cashAmount, setCashAmount] = useState<string>('');
  const [cardAmount, setCardAmount] = useState<string>('');
  const [isAddCustomerModalVisible, setIsAddCustomerModalVisible] = useState(false);
  const [isCashModalVisible, setIsCashModalVisible] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [generatedInvoice, setGeneratedInvoice] = useState<GeneratedInvoiceState | null>(null);
  const [isInvoiceModalVisible, setIsInvoiceModalVisible] = useState(false);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch.trim()) return customers;
    const term = customerSearch.toLowerCase();
    return customers.filter(
      (c) => c.name?.toLowerCase().includes(term) || c.phoneNo?.toLowerCase().includes(term),
    );
  }, [customers, customerSearch]);

  // Auto-calculate card amount when cash amount or total changes
  useEffect(() => {
    if (selectedPaymentMethod === 'Cash/Card') {
      const cash = parseFloat(cashAmount) || 0;
      const remaining = Math.max(0, total - cash);
      setCardAmount(remaining.toFixed(2));
    }
  }, [cashAmount, total, selectedPaymentMethod]);

  // Reset split amounts when switching away from Cash/Card
  useEffect(() => {
    if (selectedPaymentMethod !== 'Cash/Card') {
      setCashAmount('');
      setCardAmount('');
    } else {
      setCashAmount('');
      setCardAmount(total.toFixed(2));
    }
  }, [selectedPaymentMethod, total]);

  const handleSelectCustomer = (customer: SelectedCustomer) => {
    setSelectedCustomer(customer);
    setIsDropdownOpen(false);
    setCustomerSearch('');
  };

  const handleCompletePayment = async () => {
    const paymentDetails: any = {
      paymentMethod: selectedPaymentMethod,
      customer: selectedCustomer,
      total: total,
      items: cartItems,
    };

    if (selectedPaymentMethod === 'Cash/Card') {
      paymentDetails.cashAmount = parseFloat(cashAmount) || 0;
      paymentDetails.cardAmount = parseFloat(cardAmount) || 0;
    }

    try {
      let zatcaConfig = await getZatcaConfig();
      if (!zatcaConfig) {
        zatcaConfig = await hydrateZatcaConfigFromStorage();
      }
      if (!zatcaConfig && __DEV__) {
        try {
          zatcaConfig = await setZatcaConfigFromBackend(TEST_ZATCA_SETTINGS_PAYLOAD);
        } catch {
          // Ignore and continue to user-facing error below.
        }
      }
      if (!zatcaConfig) {
        alert('ZATCA config not found. Please sync settings first or store app settings locally.');
        return;
      }

      const previousInvoiceHash = (await AsyncStorage.getItem(PIH_STORAGE_KEY)) ?? '';

      const tax = cartItems.reduce((sum, item) => {
        const rate = item.product.uomPrice ?? item.product.price ?? 0;
        const pct = item.product.taxPercentage ?? 15;
        return sum + (rate * item.quantity * pct) / 100;
      }, 0);

      const invoiceParams: InvoiceParams = {
        invoiceUUID: randomUUID(),
        customer: {
          id: selectedCustomer?.id ?? 'WALK_IN',
          name: selectedCustomer?.name ?? 'Walk-in Customer',
          phoneNo: selectedCustomer?.phoneNo ?? null,
          taxId: selectedCustomer?.taxId ?? null,
          buyerId: selectedCustomer?.registrationNo ?? selectedCustomer?.id ?? null,
          buyerIdType: selectedCustomer?.registrationType ?? null,
          address: {
            streetName: (selectedCustomer?.addressLine1 ?? '').trim(),
            cityName: (selectedCustomer?.city ?? '').trim(),
            countryCode: 'SA',
          },
        },
        cartItems,
        tax,
        totalExcludeTax: total,
        invoiceDate: new Date(),
        previousInvoiceHash,
        invoiceNumber: String(Date.now()),
        discount: 0,
        invoiceTypeCode: '388',
        // Basic routing: selected customer => standard invoice, otherwise simplified.
        invoiceSubType: selectedCustomer ? '0100000' : '0200000',
      };

      const invoiceResult = createZatcaInvoice(invoiceParams, zatcaConfig);
      if (!invoiceResult) {
        alert('Failed to create ZATCA invoice');
        return;
      }

      await AsyncStorage.setItem(PIH_STORAGE_KEY, invoiceResult.invoiceHash);
      await AsyncStorage.setItem('@zatca_last_invoice_xml', invoiceResult.xml);
      await AsyncStorage.setItem('@zatca_last_qr_data', invoiceResult.qrData);

      console.log('Complete Payment', paymentDetails);
      setGeneratedInvoice(invoiceResult);
      setIsInvoiceModalVisible(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to complete payment';
      alert(message);
    }
  };

  const handleShareXml = async () => {
    if (!generatedInvoice?.xml) {
      alert('No XML available to share yet.');
      return;
    }

    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (!isSharingAvailable) {
      alert('Sharing is not available on this device.');
      return;
    }

    const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!baseDir) {
      alert('Cannot access local storage to prepare XML file.');
      return;
    }

    const fileUri = `${baseDir}zatca-invoice-${Date.now()}.xml`;
    await FileSystem.writeAsStringAsync(fileUri, generatedInvoice.xml, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/xml',
      dialogTitle: 'Share ZATCA Invoice XML',
      UTI: 'public.xml',
    });
  };

  const handleDoneInvoiceModal = () => {
    setIsInvoiceModalVisible(false);
    setGeneratedInvoice(null);
    dispatch(clearCart());
    router.replace('/');
  };

  const handleSaveAndClear = () => {
    console.log('Save and Clear');
    dispatch(clearCart());
    router.replace('/');
  };

  return (
    <View className="flex-1 flex-row bg-gray-50 ">
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
              className="flex-row items-center justify-between bg-white border border-gray-200 rounded-lg p-4">
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
                style={{ maxHeight: 280 }}>
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
                            taxId: customer.vatNumber,
                            registrationNo: customer.customerRegistrationNo,
                            registrationType: customer.customerRegistrationType,
                            addressLine1: customer.addressLine1,
                            city: customer.city,
                          })
                        }
                        className={`flex-row items-center px-4 py-3 border-b border-gray-50 ${
                          selectedCustomer?.id === customer.id ? 'bg-green-50' : ''
                        }`}>
                        <View className="w-8 h-8 rounded-full bg-gray-100 items-center justify-center mr-3">
                          <Ionicons name="person-outline" size={16} color="#6b7280" />
                        </View>
                        <View className="flex-1">
                          <Text className="text-gray-800 text-sm font-medium">
                            {customer.name || 'Unnamed'}
                          </Text>
                          {customer.phoneNo && (
                            <Text className="text-gray-400 text-xs">{customer.phoneNo}</Text>
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
                  className="flex-row items-center px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                  <View className="w-8 h-8 rounded-full bg-green-500 items-center justify-center mr-3">
                    <Ionicons name="add" size={18} color="white" />
                  </View>
                  <Text className="text-green-600 font-semibold text-sm">Add a new customer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Payment Method Section */}
          <View>
            <Text className="text-gray-600 font-medium mb-3">Select Payment Method</Text>
            <View className="flex-row gap-3">
              <PaymentMethodOption
                icon="wallet-outline"
                title="Cash/Card"
                subtitle="Split payment between cash and card"
                isSelected={selectedPaymentMethod === 'Cash/Card'}
                onPress={() => {
                  if (selectedPaymentMethod !== 'Cash/Card') {
                    setSelectedPaymentMethod('Cash/Card');
                    setIsCashModalVisible(true);
                  }
                }}
                color="#f59e0b"
                bgIcon="bg-amber-100"
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
                icon="card-outline"
                title="Card Payment"
                subtitle="Process payment using credit or debit card"
                isSelected={selectedPaymentMethod === 'Card'}
                onPress={() => setSelectedPaymentMethod('Card')}
                color="#3b82f6"
                bgIcon="bg-blue-100"
              />
            </View>

            {/* Cash/Card Split Amount Inputs */}
            {selectedPaymentMethod === 'Cash/Card' && (
              <View className="mt-4 bg-white border border-gray-200 rounded-xl p-4 gap-4">
                <Text className="text-gray-700 font-semibold text-sm">Split Payment Amounts</Text>
                <View className="flex-row gap-4">
                  <View className="flex-1">
                    <Text className="text-gray-500 text-xs mb-1">Cash Amount</Text>
                    <TouchableOpacity
                      onPress={() => setIsCashModalVisible(true)}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <Text
                        className={`font-medium text-base ${cashAmount ? 'text-gray-800' : 'text-gray-400'}`}>
                        {cashAmount || '0.00'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View className="flex-1">
                    <Text className="text-gray-500 text-xs mb-1">Card Amount</Text>
                    <View className="bg-gray-100 border border-gray-200 rounded-lg p-3">
                      <Text className="text-gray-800 font-medium text-base">
                        {cardAmount || '0.00'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Right Column: Order Summary */}
      <View className="w-1/3 h-full bg-white shadow-xl flex-col">
        <View className="flex-1">
          <OrderSummary
            cartItems={cartItems}
            onRemoveItem={(index) => dispatch(removeFromCart(index))}
            onUpdateQuantity={(index, delta) => dispatch(updateQuantity({ index, delta }))}
            onCheckout={() => {}}
            showActions={false}
          />
        </View>

        {/* Custom Actions for Checkout Page */}
        <View className="p-4 bg-gray-50 border-t border-gray-200 gap-3">
          <TouchableOpacity
            onPress={handleCompletePayment}
            disabled={isCreatingInvoice}
            className="w-full bg-green-500 py-4 rounded-xl items-center flex-row justify-center">
            <Text className="text-white font-bold text-lg mr-2">
              {isCreatingInvoice ? 'Generating Invoice...' : 'Complete Payment'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSaveAndClear}
            className="w-full bg-gray-200 py-3 rounded-xl items-center flex-row justify-center">
            <Ionicons name="save-outline" size={20} color="#374151" style={{ marginRight: 8 }} />
            <Text className="text-gray-700 font-semibold">Save and Clear</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.back()}
            className="w-full bg-gray-100 py-3 rounded-xl items-center flex-row justify-center">
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
      <CashAmountModal
        visible={isCashModalVisible}
        onClose={() => setIsCashModalVisible(false)}
        onSubmit={(amount) => setCashAmount(amount)}
        totalAmount={total}
        initialAmount={cashAmount}
      />

      <Modal visible={isInvoiceModalVisible} animationType="fade" transparent>
        <View className="flex-1 bg-black/50 justify-center items-center p-4">
          <View className="bg-white rounded-2xl w-full max-w-md p-5">
            <Text className="text-xl font-bold text-gray-800 mb-2">ZATCA Invoice Generated</Text>
            <Text className="text-gray-500 mb-4">Scan QR or share the generated XML file.</Text>

            {generatedInvoice?.qrData ? (
              <View className="items-center mb-4">
                <InvoiceQR qrData={generatedInvoice.qrData} size={210} />
              </View>
            ) : (
              <Text className="text-red-500 mb-4">QR data is not available.</Text>
            )}

            <View className="bg-gray-50 rounded-lg p-3 mb-4">
              <Text className="text-xs text-gray-500">Invoice Hash (PIH)</Text>
              <Text className="text-xs text-gray-700 mt-1" numberOfLines={2}>
                {generatedInvoice?.invoiceHash ?? '-'}
              </Text>
            </View>

            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleShareXml}
                className="flex-1 bg-blue-500 py-3 rounded-xl items-center">
                <Text className="text-white font-semibold">Share XML</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDoneInvoiceModal}
                className="flex-1 bg-green-500 py-3 rounded-xl items-center">
                <Text className="text-white font-semibold">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
      className={`flex-1 p-4 rounded-xl border ${
        isSelected ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'
      }`}>
      <View className="flex-row justify-between items-start mb-3">
        <View className={`w-12 h-12 rounded-full items-center justify-center ${bgIcon}`}>
          <Ionicons name={icon} size={24} color={color} />
        </View>
        {isSelected && <Ionicons name="checkmark-circle" size={24} color="#22c55e" />}
      </View>
      <View>
        <Text className="text-gray-800 font-bold text-base mb-1">{title}</Text>
        <Text className="text-gray-500 text-xs">{subtitle}</Text>
      </View>
    </TouchableOpacity>
  );
}
