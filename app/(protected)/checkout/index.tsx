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
import {
    createInvoicePipeline,
    saveInvoiceXML,
    shareInvoiceXML,
} from '@/src/services/zatca/invoicePipeline';
import type { Invoice } from '@/src/services/zatca/types';
import {
    getPreviousInvoiceHash,
    isTaxIncludedInPrice,
    certificate as zatcaCert,
    supplier as zatcaSupplier,
} from '@/src/services/zatca/zatcaConfig';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import { randomUUID } from 'expo-crypto';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

type PaymentMethod = 'Cash/Card' | 'Cash' | 'Card';

interface SelectedCustomer {
  id: string;
  name: string | null;
  phoneNo: string | null;
}

export default function CheckoutPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const cartItems = useAppSelector(selectCartItems);
  const total = useAppSelector(selectTotal);
  const { data: customers } = useCustomers();

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod>('Cash');
  const [cashAmount, setCashAmount] = useState<string>('');
  const [cardAmount, setCardAmount] = useState<string>('');
  const [isAddCustomerModalVisible, setIsAddCustomerModalVisible] = useState(false);
  const [isCashModalVisible, setIsCashModalVisible] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // ZATCA Result State
  const [isZatcaModalVisible, setIsZatcaModalVisible] = useState(false);
  const [invoiceType, setInvoiceType] = useState<'B2C' | 'B2B'>('B2C');
  const [zatcaResult, setZatcaResult] = useState<{
    xml: string;
    hash: string;
    signature: string;
    qrBase64: string;
    savedUri?: string;
  } | null>(null);
  const [invoiceData, setInvoiceData] = useState<Invoice | null>(null);

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
  }, [selectedPaymentMethod]);

  const handleSelectCustomer = (customer: SelectedCustomer) => {
    setSelectedCustomer(customer);
    setIsDropdownOpen(false);
    setCustomerSearch('');
  };

  const handleCompletePayment = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    try {
      const now = new Date();
      const previousHash = await getPreviousInvoiceHash();

      const invoice: Invoice = {
        uuid: randomUUID(),
        invoiceNumber: `INV-${Date.now()}`,
        issueDate: now.toISOString().split('T')[0],
        issueTime: now.toTimeString().split(' ')[0],
        timestamp: now.toISOString(),
        supplier: zatcaSupplier,
        customer: {
          registrationName: selectedCustomer?.name ?? 'Walk-in Customer',
        },
        previousInvoiceHash: previousHash,
        currency: 'SAR',
        discount: 0,
        isTaxIncludedInPrice,
        invoiceSubtype: invoiceType === 'B2B' ? '0100000' : '0200000',
        items: cartItems.map((ci) => ({
          name: ci.product.name ?? 'Unknown Item',
          quantity: ci.quantity,
          price: ci.product.uomPrice ?? ci.product.price ?? 0,
          taxPercentage: ci.product.taxPercentage ?? 15,
          unitOfMeasure: ci.product.uom ?? 'PCE',
        })),
      };

      const result = await createInvoicePipeline(
        invoice,
        zatcaCert.certificateBase64,
        zatcaCert.privateKeyBase64,
      );
      console.log('ZATCA Invoice Result generated successfully.', result.hash);

      // Save XML to device (optional but recommended for ZATCA)
      const savedUri = await saveInvoiceXML(invoice.invoiceNumber, result.xml);

      // Display the QR Code Modal
      setZatcaResult({ ...result, savedUri });
      setInvoiceData(invoice);
      setIsZatcaModalVisible(true);

      // Moved dispatch(clearCart()) and router.replace('/') to the Modal close handler
    } catch (error) {
      console.error('Invoice pipeline error:', error);
      Alert.alert('Error', 'Failed to generate invoice. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCloseZatcaModal = () => {
    setIsZatcaModalVisible(false);
    setZatcaResult(null);
    setInvoiceData(null);
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

          {/* Invoice Type Section */}
          <View className="mb-8">
            <Text className="text-gray-600 font-medium mb-3">Invoice Type</Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setInvoiceType('B2C')}
                className={`flex-1 p-4 rounded-xl border flex-row items-center ${
                  invoiceType === 'B2C'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white'
                }`}>
                <View
                  className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${invoiceType === 'B2C' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                  <Ionicons
                    name="document-text-outline"
                    size={20}
                    color={invoiceType === 'B2C' ? '#6366f1' : '#6b7280'}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className={`font-bold text-base ${invoiceType === 'B2C' ? 'text-indigo-900' : 'text-gray-800'}`}>
                    B2C (Simplified)
                  </Text>
                  <Text className="text-gray-500 text-xs mt-0.5">Individual customers</Text>
                </View>
                {invoiceType === 'B2C' && (
                  <Ionicons name="checkmark-circle" size={24} color="#6366f1" />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setInvoiceType('B2B')}
                className={`flex-1 p-4 rounded-xl border flex-row items-center ${
                  invoiceType === 'B2B'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 bg-white'
                }`}>
                <View
                  className={`w-10 h-10 rounded-full items-center justify-center mr-3 ${invoiceType === 'B2B' ? 'bg-indigo-100' : 'bg-gray-100'}`}>
                  <Ionicons
                    name="business-outline"
                    size={20}
                    color={invoiceType === 'B2B' ? '#6366f1' : '#6b7280'}
                  />
                </View>
                <View className="flex-1">
                  <Text
                    className={`font-bold text-base ${invoiceType === 'B2B' ? 'text-indigo-900' : 'text-gray-800'}`}>
                    B2B (Standard)
                  </Text>
                  <Text className="text-gray-500 text-xs mt-0.5">Business-to-Business</Text>
                </View>
                {invoiceType === 'B2B' && (
                  <Ionicons name="checkmark-circle" size={24} color="#6366f1" />
                )}
              </TouchableOpacity>
            </View>
          </View>

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
            disabled={isProcessing}
            className={`w-full py-4 rounded-xl items-center flex-row justify-center ${isProcessing ? 'bg-gray-400' : 'bg-green-500'}`}>
            <Text className="text-white font-bold text-lg mr-2">
              {isProcessing ? 'Processing...' : 'Complete Payment'}
            </Text>
            {!isProcessing && <Ionicons name="chevron-forward" size={20} color="white" />}
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

      {/* ZATCA Success / QR Code Modal */}
      <Modal visible={isZatcaModalVisible} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center">
          <View className="w-11/12 max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl">
            <View className="bg-green-50 px-6 py-4 flex-row items-center justify-between border-b border-green-100">
              <View className="flex-row items-center">
                <View className="w-10 h-10 rounded-full bg-green-100 items-center justify-center mr-3">
                  <Ionicons name="checkmark-circle" size={24} color="#22c55e" />
                </View>
                <View>
                  <Text className="text-xl font-bold text-gray-800">Invoice Generated</Text>
                  <Text className="text-sm text-green-600 font-medium">
                    ZATCA {invoiceType === 'B2B' ? 'B2B Standard' : 'B2C Simplified'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleCloseZatcaModal} className="p-2">
                <Ionicons name="close" size={24} color="#6b7280" />
              </TouchableOpacity>
            </View>

            <View className="p-6 items-center">
              <View className="mb-6 items-center">
                <Text className="text-gray-500 mb-1">Invoice Number</Text>
                <Text className="text-lg font-bold text-gray-800">
                  {invoiceData?.invoiceNumber}
                </Text>
              </View>

              {zatcaResult?.qrBase64 ? (
                <View className="p-4 bg-white rounded-xl shadow-sm border border-gray-100 items-center justify-center">
                  <QRCode value={zatcaResult.qrBase64} size={200} quietZone={10} />
                  <Text className="text-xs text-gray-400 mt-4 text-center px-4">
                    Scan with official ZATCA app or supported QR reader
                  </Text>
                </View>
              ) : (
                <View className="w-48 h-48 bg-gray-100 rounded-xl items-center justify-center">
                  <Text className="text-gray-400">QR Code Error</Text>
                </View>
              )}

              <View className="w-full mt-6 pt-6 border-t border-gray-100 gap-3">
                <TouchableOpacity
                  onPress={() => {
                    if (zatcaResult?.savedUri) {
                      shareInvoiceXML(zatcaResult.savedUri);
                    }
                  }}
                  className="w-full bg-gray-100 py-3 rounded-xl items-center flex-row justify-center border border-gray-200">
                  <Ionicons name="share-outline" size={20} color="#374151" className="mr-2" />
                  <Text className="text-gray-700 font-semibold text-lg ml-2">Share XML</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleCloseZatcaModal}
                  className="w-full bg-green-500 py-3 rounded-xl items-center">
                  <Text className="text-white font-bold text-lg">Done & New Order</Text>
                </TouchableOpacity>
              </View>
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
