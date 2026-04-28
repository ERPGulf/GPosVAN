import { selectUser } from '@/src/features/auth/authSlice';
import {
  clearCart,
  removeFromCart,
  selectCartItems,
  selectTotal,
  selectDiscount,
  updateQuantityAsync,
} from '@/src/features/cart/cartSlice';
import { AddCustomerModal } from '@/src/features/customers/components/AddCustomerModal';
import { useCustomers } from '@/src/features/customers/hooks/useCustomers';
import {
  buildInvoiceJsonDump,
  formatDateTimeForApi,
  syncInvoiceToServer,
  syncUnclearedInvoiceToServer,
} from '@/src/features/invoices/services/invoiceApi.service';
import { CashAmountModal } from '@/src/features/orders/components/CashAmountModal';
import { OrderSummary } from '@/src/features/orders/components/OrderSummary';
import { selectShiftLocalId, selectShiftOpeningId } from '@/src/features/shifts/shiftSlice';

import { InvoiceQR } from '@/src/features/zatca/components/InvoiceQR';
import { useCreateInvoice } from '@/src/features/zatca/hooks/useCreateInvoice';
import { saveInvoiceFiles } from '@/src/features/zatca/services/invoiceFileStorage';
import {
  getZatcaConfig,
  hydrateZatcaConfigFromStorage,
  setZatcaConfigFromBackend,
} from '@/src/features/zatca/services/zatcaConfig';
import { getZatcaPayloadFromSecureStore } from '@/src/features/zatca/services/zatcaTestPayload';
import type { InvoiceParams } from '@/src/features/zatca/types';
import {
  getNextInvoiceNo,
  markInvoiceAsSynced,
  markInvoiceErrorSynced,
  markInvoiceSyncError,
  saveInvoiceToDb,
} from '@/src/infrastructure/db/invoices.repository';
import { selectAppConfig } from '@/src/features/app/appConfigSlice';
import { getMachineName } from '@/src/services/credentialStore';
import { useAppDispatch, useAppSelector } from '@/src/store/hooks';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { drizzle } from 'drizzle-orm/expo-sqlite';
import { randomUUID } from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  invoiceUUID: string;
  xml: string;
  qrData: string;
  invoiceHash: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const sqliteDb = useSQLiteContext();
  const db = drizzle(sqliteDb);
  const cartItems = useAppSelector(selectCartItems);
  const total = useAppSelector(selectTotal);
  const totalDiscount = useAppSelector(selectDiscount);
  const user = useAppSelector(selectUser);
  const shiftLocalId = useAppSelector(selectShiftLocalId);
  const shiftOpeningId = useAppSelector(selectShiftOpeningId);
  const selectedPosProfile = useAppSelector((state) => state.auth.selectedPosProfile);
  const appConfig = useAppSelector(selectAppConfig);
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
    if (cartItems.length === 0) {
      alert('Please add at least 1 product before completing payment.');
      return;
    }

    if (!selectedCustomer) {
      alert('Please select a customer before completing payment.');
      return;
    }

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
          const payload = await getZatcaPayloadFromSecureStore();
          if (payload) {
            zatcaConfig = await setZatcaConfigFromBackend(payload);
          }
        } catch {
          // Ignore and continue to user-facing error below.
        }
      }
      if (!zatcaConfig) {
        alert('ZATCA config not found! Please sync settings first or store app settings locally.');
        return;
      }

      // For the very first invoice there is no stored PIH yet.
      // Fall back to the initial PIH that was provisioned in the app config.
      let previousInvoiceHash = await AsyncStorage.getItem(PIH_STORAGE_KEY);
      if (!previousInvoiceHash) {
        previousInvoiceHash = appConfig?.zatca?.pih ?? '';
      }

      const tax = cartItems.reduce((sum, item) => {
        const rate = item.product.uomPrice ?? item.product.price ?? 0;
        const pct = item.product.taxPercentage ?? 15;
        return sum + (rate * item.quantity * pct) / 100;
      }, 0);

      const invoiceParams: InvoiceParams = {
        invoiceUUID: randomUUID(),
        customer: {
          id: selectedCustomer?.id ?? null,
          name: selectedCustomer?.name ?? null,
          phoneNo: selectedCustomer?.phoneNo ?? null,
          taxId: selectedCustomer?.taxId ?? null,
          buyerId: selectedCustomer?.registrationNo ?? null,
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
        discount: totalDiscount,
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

      // Generate a human-readable, sequential invoice number and persist to DB
      const invoiceNo = await getNextInvoiceNo(db);
      const invoiceDate = invoiceParams.invoiceDate;

      await saveInvoiceToDb(db, {
        invoiceUUID: invoiceParams.invoiceUUID,
        invoiceNo,
        customerId: selectedCustomer?.id ?? 'WALK_IN',
        shiftId: shiftLocalId ?? null,
        userId: user?.id ?? null,
        posProfile: selectedPosProfile ?? null,
        previousInvoiceHash: previousInvoiceHash,
        discount: totalDiscount,
        cartItems,
        paymentMethod: selectedPaymentMethod,
        cashAmount: parseFloat(cashAmount) || 0,
        cardAmount: parseFloat(cardAmount) || 0,
        dateTime: invoiceDate,
      });

      // Invoice UUID is stored in state so the QR PNG capture callback can save files
      const invoiceUUID = invoiceParams.invoiceUUID;

      console.log('Invoice saved to DB:', invoiceNo);
      setGeneratedInvoice({ invoiceUUID, ...invoiceResult });
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
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 flex-row bg-gray-50"
    >
      {/* Left Column: Actions */}
      <ScrollView className="flex-1 p-6" contentContainerStyle={{ paddingBottom: 120 }}>
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
            onUpdateQuantity={(index, delta) => dispatch(updateQuantityAsync({ index, delta }))}
            onCheckout={() => {}}
            showActions={false}
          />
        </View>

        {/* Custom Actions for Checkout Page */}
        <View className="p-4 bg-gray-50 border-t border-gray-200 gap-3">
          <TouchableOpacity
            onPress={handleCompletePayment}
            disabled={isCreatingInvoice || cartItems.length === 0 || !selectedCustomer}
            className={`w-full py-4 rounded-xl items-center flex-row justify-center ${isCreatingInvoice || cartItems.length === 0 || !selectedCustomer ? 'bg-gray-300' : 'bg-green-500'}`}>
            <Text className="text-white font-bold text-lg mr-2">
              {isCreatingInvoice ? 'Generating Invoice...' : 'Complete Payment'}
            </Text>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </TouchableOpacity>

          {/* <TouchableOpacity
            onPress={handleSaveAndClear}
            className="w-full bg-gray-200 py-3 rounded-xl items-center flex-row justify-center">
            <Ionicons name="save-outline" size={20} color="#374151" style={{ marginRight: 8 }} />
            <Text className="text-gray-700 font-semibold">Save and Clear</Text>
          </TouchableOpacity> */}

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
                <InvoiceQR
                  qrData={generatedInvoice.qrData}
                  size={210}
                  onCapturePng={async (base64Png) => {
                    try {
                      const { xmlPath, qrPngPath } = await saveInvoiceFiles(
                        generatedInvoice.invoiceUUID,
                        generatedInvoice.xml,
                        base64Png,
                      );
                      console.log(`Invoice files saved: ${xmlPath}, ${qrPngPath}`);

                      // Fire-and-forget: sync invoice to server
                      (async () => {
                        try {
                          if (!shiftOpeningId) {
                            console.warn(
                              '[Checkout] shiftOpeningId is null — skipping invoice sync',
                            );
                            // Alert.alert('Sync Pending', 'Please sync open shift first. Invoice will remain unsynced.');
                            return;
                          }

                          const invoiceData =
                            await import('@/src/infrastructure/db/invoices.repository').then(
                              (mod) => mod.getInvoiceForSync(db, generatedInvoice.invoiceUUID),
                            );
                          if (!invoiceData) {
                            console.error('[Checkout] Invoice not found in DB for sync');
                            return;
                          }

                          const phase = appConfig?.phase || '1';
                          const machineName = await getMachineName() || 'UNKNOWN';

                          // Build items JSON array
                          const itemsJson = JSON.stringify(
                            invoiceData.items.map((item) => ({
                              item_code: item.itemCode || '',
                              quantity: item.quantity || 0,
                              rate: item.rate || 0,
                              uom: item.unitOfMeasure || 'Nos',
                              tax_rate: item.taxPercentage || 0,
                            })),
                          );

                          // Build payments JSON array
                          const paymentsJson = JSON.stringify(
                            invoiceData.payments.map((p) => ({
                              mode_of_payment: p.modeOfPayment || 'Cash',
                              amount: (p.amount || 0).toFixed(2),
                            })),
                          );

                          const serverId = await syncInvoiceToServer({
                            customerName: selectedCustomer?.name || 'Walk In',
                            customerPurchaseOrder: invoiceData.invoice.customerPurchaseOrder || 0,
                            items: itemsJson,
                            qrPngUri: qrPngPath,
                            xmlUri: xmlPath,
                            uniqueId: generatedInvoice.invoiceUUID,
                            machineName,
                            payments: paymentsJson,
                            phase,
                            posProfile: selectedPosProfile || '',
                            offlineInvoiceNumber: invoiceData.invoice.invoiceNo || '',
                            customOfflineCreationTime: formatDateTimeForApi(
                              invoiceData.invoice.dateTime,
                            ),
                            posShift: shiftOpeningId,
                          });

                          // Update local DB with server invoice ID
                          await markInvoiceAsSynced(db, generatedInvoice.invoiceUUID, serverId);
                          console.log('[Checkout] Invoice synced, server ID:', serverId);
                        } catch (syncErr) {
                          // Detect if this is a network error (device offline / no connectivity)
                          // vs an actual API error (server returned an error response).
                          const isNetworkError =
                            syncErr &&
                            typeof syncErr === 'object' &&
                            'message' in syncErr &&
                            (syncErr as any).message === 'Network Error' &&
                            !('response' in syncErr && (syncErr as any).response);

                          if (isNetworkError) {
                            // Network error — the request never reached the server.
                            // Leave invoice as isSynced=false, isError=false so the
                            // background sync (pushPendingInvoices) will retry it
                            // when connectivity is restored.
                            if (__DEV__) {
                              console.log(
                                '[Checkout] Invoice sync failed due to network error, will retry via background sync',
                              );
                            }
                          } else {
                            // Actual API error — server returned an error response
                            if (__DEV__) {
                              console.log(
                                '[Checkout] Invoice sync failed with API error, marking as errored:',
                                syncErr,
                              );
                            }

                            // Capture the error message before the async IIFE
                            // (Hermes can't closure-capture catch block params in nested async functions)
                            let capturedApiResponse = '';
                            try {
                              if (syncErr && typeof syncErr === 'object' && 'response' in syncErr) {
                                capturedApiResponse = JSON.stringify(
                                  (syncErr as any).response?.data ?? (syncErr as any).message,
                                );
                              } else if (syncErr instanceof Error) {
                                capturedApiResponse = JSON.stringify({ message: syncErr.message });
                              } else {
                                capturedApiResponse = JSON.stringify(syncErr);
                              }
                            } catch {
                              capturedApiResponse = String(syncErr);
                            }

                            // Persist the error to the local DB
                            try {
                              await markInvoiceSyncError(db, generatedInvoice.invoiceUUID, syncErr);
                            } catch (dbErr) {
                              console.error('[Checkout] Failed to save sync error to DB:', dbErr);
                            }

                            // Fire-and-forget: sync the errored invoice to the uncleared endpoint
                            (async () => {
                              try {
                                const invoiceData =
                                  await import('@/src/infrastructure/db/invoices.repository').then(
                                    (mod) =>
                                      mod.getInvoiceForSync(db, generatedInvoice.invoiceUUID),
                                  );
                                if (!invoiceData) return;

                                const phase = appConfig?.phase || '1';
                                const machineName =
                                  await getMachineName() || 'UNKNOWN';

                                const itemsJson = JSON.stringify(
                                  invoiceData.items.map((item) => ({
                                    item_code: item.itemCode || '',
                                    quantity: item.quantity || 0,
                                    rate: item.rate || 0,
                                    uom: item.unitOfMeasure || 'Nos',
                                    tax_rate: item.taxPercentage || 0,
                                  })),
                                );

                                const paymentsJson = JSON.stringify(
                                  invoiceData.payments.map((p) => ({
                                    mode_of_payment: p.modeOfPayment || 'Cash',
                                    amount: (p.amount || 0).toFixed(2),
                                  })),
                                );

                                const jsonDump = buildInvoiceJsonDump({
                                  machineName,
                                  customOfflineCreationTime: formatDateTimeForApi(
                                    invoiceData.invoice.dateTime,
                                  ),
                                  posShift: shiftOpeningId || '',
                                  discountAmount: (invoiceData.invoice.discount || 0).toFixed(2),
                                  phase,
                                  offlineInvoiceNumber: invoiceData.invoice.invoiceNo || '',
                                  posProfile: selectedPosProfile || '',
                                  cashier: user?.id || '',
                                  customerName: selectedCustomer?.name || 'Walk In',
                                  uniqueId: generatedInvoice.invoiceUUID,
                                  customerPurchaseOrder: String(
                                    invoiceData.invoice.customerPurchaseOrder || 0,
                                  ),
                                  pih: invoiceData.invoice.previousInvoiceHash || '',
                                  payments: paymentsJson,
                                  items: itemsJson,
                                });

                                await syncUnclearedInvoiceToServer({
                                  dateTime: formatDateTimeForApi(invoiceData.invoice.dateTime),
                                  invoiceNumber: invoiceData.invoice.invoiceNo || '',
                                  jsonDump,
                                  apiResponse: capturedApiResponse,
                                });

                                // Mark the error as synced to the server
                                await markInvoiceErrorSynced(db, generatedInvoice.invoiceUUID);
                                if (__DEV__) {
                                  console.log('[Checkout] Uncleared invoice synced to server');
                                }
                              } catch (unclearedErr) {
                                if (__DEV__) {
                                  console.log(
                                    '[Checkout] Failed to sync uncleared invoice:',
                                    unclearedErr,
                                  );
                                }
                              }
                            })();
                          }
                        }
                      })();
                    } catch (err) {
                      console.error('Failed to save invoice files:', err);
                    }
                  }}
                />
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
    </KeyboardAvoidingView>
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
