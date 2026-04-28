import { selectAppConfig } from '@/src/features/app/appConfigSlice';
import { selectUser } from '@/src/features/auth/authSlice';
import {
  addReturnItem,
  removeReturnItem,
  resetSalesReturn,
  selectCanSubmit,
  selectMobile,
  selectOriginalInvoice,
  selectReason,
  selectRefundAmount,
  selectReturnItems,
  selectSalesReturnError,
  selectSalesReturnStatus,
  selectSearchTerm,
  selectSplitItems,
  setDone,
  setError,
  setInvoiceFound,
  setInvoiceNotFound,
  setMobile,
  setReason,
  setSaving,
  setSearching,
  setSearchTerm,
  updateReturnQty,
} from '@/src/features/sales-return/salesReturnSlice';
import {
  formatDateTimeForApi,
  syncSalesReturnToServer,
} from '@/src/features/sales-return/services/salesReturnApi.service';
import { selectIsShiftOpen, selectShiftLocalId, selectShiftOpeningId } from '@/src/features/shifts/shiftSlice';
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
import { getNextInvoiceNo } from '@/src/infrastructure/db/invoices.repository';
import {
  getEffectiveRate,
  lookupInvoice,
  saveSalesReturn,
  updateSalesReturnFiles,
} from '@/src/infrastructure/db/salesReturn.repository';
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
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

const PIH_STORAGE_KEY = '@zatca_pih';

interface GeneratedReturnState {
  returnId: string;
  xml: string;
  qrData: string;
  invoiceHash: string;
}

export default function SalesReturnPage() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const sqliteDb = useSQLiteContext();
  const db = drizzle(sqliteDb);
  const user = useAppSelector(selectUser);
  const shiftLocalId = useAppSelector(selectShiftLocalId);
  const shiftOpeningId = useAppSelector(selectShiftOpeningId);
  const isShiftOpen = useAppSelector(selectIsShiftOpen);
  const selectedPosProfile = useAppSelector((state) => state.auth.selectedPosProfile);
  const appConfig = useAppSelector(selectAppConfig);
  const { create: createZatcaInvoice } = useCreateInvoice();

  // Redux state
  const searchTerm = useAppSelector(selectSearchTerm);
  const originalInvoice = useAppSelector(selectOriginalInvoice);
  const splitItems = useAppSelector(selectSplitItems);
  const returnItems = useAppSelector(selectReturnItems);
  const refundAmount = useAppSelector(selectRefundAmount);
  const reason = useAppSelector(selectReason);
  const mobile = useAppSelector(selectMobile);
  const status = useAppSelector(selectSalesReturnStatus);
  const error = useAppSelector(selectSalesReturnError);
  const canSubmit = useAppSelector(selectCanSubmit);

  const [generatedReturn, setGeneratedReturn] = useState<GeneratedReturnState | null>(null);
  const [isReturnModalVisible, setIsReturnModalVisible] = useState(false);

  // Reset state when navigating away
  useEffect(() => {
    return () => {
      dispatch(resetSalesReturn());
    };
  }, [dispatch]);

  // ─── Invoice Search ──────────────────────────────────────────────────────────

  const handleSearch = async () => {
    const term = searchTerm.trim();
    if (!term) return;

    dispatch(setSearching());

    try {
      const result = await lookupInvoice(db, term);
      if (result) {
        dispatch(setInvoiceFound({ invoice: result.invoice, splitItems: result.splitItems }));
      } else {
        dispatch(setInvoiceNotFound());
      }
    } catch (err) {
      dispatch(setError('Failed to search for invoice. Please try again.'));
    }
  };

  // ─── Process Return ──────────────────────────────────────────────────────────

  const handleProcessReturn = async () => {
    if (!canSubmit || !originalInvoice) return;

    if (!isShiftOpen) {
      Alert.alert('Shift Required', 'Please open a shift before processing a return.');
      return;
    }

    dispatch(setSaving());

    try {
      // 1. Prepare ZATCA config
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
          // Ignore
        }
      }
      if (!zatcaConfig) {
        dispatch(setError('ZATCA config not found! Please sync settings first.'));
        return;
      }

      // 2. Get PIH
      let previousInvoiceHash = await AsyncStorage.getItem(PIH_STORAGE_KEY);
      if (!previousInvoiceHash) {
        previousInvoiceHash = appConfig?.zatca?.pih ?? '';
      }

      // 3. Generate return invoice number
      const invoiceNo = await getNextInvoiceNo(db);
      const returnInvoiceNo = `${invoiceNo}-RET`;
      const invoiceUUID = randomUUID();

      // 4. Build return items for DB (negative quantities)
      const dbItems = returnItems.map((item) => ({
        itemCode: item.itemCode,
        itemName: item.itemName,
        quantity: -item.returnQty, // NEGATIVE for credit note
        rate: item.rate,
        taxRate: item.taxRate,
        uom: item.uom,
        discountType: item.discountType,
        discountValue: item.discountValue,
        minQty: item.minQty,
        maxQty: item.maxQty,
      }));

      // 5. Build cart items for ZATCA XML (with effective rates for credited amounts)
      const cartItemsForZatca = returnItems.map((item) => ({
        product: {
          itemCode: item.itemCode,
          name: item.itemName,
          uomPrice: getEffectiveRate(item.rate, item.discountType, item.discountValue),
          price: item.rate,
          taxPercentage: item.taxRate,
          uom: item.uom,
          uomId: null,
        },
        quantity: item.returnQty, // positive for XML calculation
        promotion: null,
      }));

      const tax = cartItemsForZatca.reduce((sum, item) => {
        const rate = item.product.uomPrice ?? item.product.price ?? 0;
        const pct = item.product.taxPercentage ?? 15;
        return sum + (rate * item.quantity * pct) / 100;
      }, 0);

      // 6. Generate ZATCA Credit Note XML (type 381)
      // const creditNoteReason = `${reason} Mobile:${mobile}`;
      const invoiceParams: InvoiceParams = {
        invoiceUUID,
        customer: {
          id: originalInvoice.customerId,
          name: originalInvoice.customerId,
          phoneNo: mobile,
        },
        cartItems: cartItemsForZatca as any,
        tax,
        totalExcludeTax: refundAmount,
        invoiceDate: new Date(),
        previousInvoiceHash,
        invoiceNumber: returnInvoiceNo.replace(/[^0-9]/g, ''),
        discount: 0,
        invoiceTypeCode: '381', // Credit Note
        invoiceSubType: '0200000', // Simplified
        billingReference: originalInvoice.invoiceId ?? undefined,
        // creditNoteReason, // KSA-10: required for ZATCA BR-KSA-17
      };

      const invoiceResult = createZatcaInvoice(invoiceParams, zatcaConfig);
      if (!invoiceResult) {
        dispatch(setError('Failed to generate ZATCA Credit Note XML.'));
        return;
      }

      // 7. Save PIH for next invoice
      await AsyncStorage.setItem(PIH_STORAGE_KEY, invoiceResult.invoiceHash);
      await AsyncStorage.setItem('@zatca_last_invoice_xml', invoiceResult.xml);
      await AsyncStorage.setItem('@zatca_last_qr_data', invoiceResult.qrData);

      // 8. Save to local DB
      const returnId = await saveSalesReturn(db, {
        returnId: invoiceUUID,
        customerId: originalInvoice.customerId,
        invoiceId: originalInvoice.invoiceId, // return_against (server-side ID)
        invoiceNumber: returnInvoiceNo,
        pih: previousInvoiceHash,
        reason: `${reason} Mobile:${mobile}`,
        shiftId: shiftLocalId ?? null,
        userId: user?.id ?? null,
        posProfile: selectedPosProfile ?? null,
        items: dbItems,
      });

      // 9. Display modal
      setGeneratedReturn({ returnId: invoiceUUID, ...invoiceResult });
      setIsReturnModalVisible(true);
      dispatch(setDone());
    } catch (err: any) {
      console.error('[SalesReturn] Process return failed:', err);
      dispatch(setError(err?.message || 'Failed to process return. Please try again.'));
    }
  };

  // ─── QR capture & sync ───────────────────────────────────────────────────────

  const handleQRCapture = async (base64Png: string) => {
    if (!generatedReturn) return;

    try {
      const { qrPngPath: qrPath, xmlPath } = await saveInvoiceFiles(
        generatedReturn.returnId,
        generatedReturn.xml,
        base64Png,
      );

      await updateSalesReturnFiles(db, generatedReturn.returnId, qrPath, xmlPath);

      // Attempt immediate sync
      try {
        const returnData = await (await import('@/src/infrastructure/db/salesReturn.repository')).getSalesReturnForSync(db, generatedReturn.returnId);
        if (!returnData) return;

        const itemsJson = JSON.stringify(
          returnData.items.map((item) => ({
            item_code: item.itemCode || '',
            quantity: item.quantity || 0,
            rate: getEffectiveRate(item.rate ?? 0, item.discountType, item.discountValue ?? 0),
            uom: item.uom || 'Nos',
            tax_rate: item.taxRate || 0,
          })),
        );

        const totalRefund = returnData.items.reduce((sum, item) => {
          const absQty = Math.abs(item.quantity ?? 0);
          const effectiveRate = getEffectiveRate(item.rate ?? 0, item.discountType, item.discountValue ?? 0);
          return sum + absQty * effectiveRate;
        }, 0);

        const paymentsJson = JSON.stringify([{ payment_mode: 'Cash', amount: `-${totalRefund.toFixed(2)}` }]);

        const machineName = (await getMachineName()) || 'UNKNOWN';

        const serverId = await syncSalesReturnToServer({
          customerName: returnData.salesReturn.customerId || 'Walk In',
          pih: returnData.salesReturn.pih || '',
          uniqueId: generatedReturn.returnId,
          machineName,
          offlineInvoiceNumber: returnData.salesReturn.invoiceNumber || '',
          posProfile: selectedPosProfile || '',
          returnAgainst: returnData.salesReturn.invoiceId || '',
          reason: returnData.salesReturn.reason || '',
          posShift: shiftOpeningId || '',
          offlineCreationTime: formatDateTimeForApi(returnData.salesReturn.createdOn),
          items: itemsJson,
          payments: paymentsJson,
          qrPngUri: qrPath,
          xmlUri: xmlPath,
        });

        const { markSalesReturnSynced } = await import('@/src/infrastructure/db/salesReturn.repository');
        await markSalesReturnSynced(db, generatedReturn.returnId, serverId);

        if (__DEV__) {
          console.log('[SalesReturn] Return synced → server ID:', serverId);
        }
      } catch (syncErr: any) {
        // Sync failure is non-blocking — background retry will handle it
        if (__DEV__) {
          console.log('[SalesReturn] Immediate sync failed, will retry in background:', syncErr?.message);
        }
        const isNetworkError = syncErr?.message === 'Network Error' && !syncErr?.response;
        if (!isNetworkError) {
          try {
            const { markSalesReturnSyncError } = await import('@/src/infrastructure/db/salesReturn.repository');
            await markSalesReturnSyncError(db, generatedReturn.returnId, syncErr);
          } catch {
            // Best effort
          }
        }
      }
    } catch (err) {
      console.error('[SalesReturn] Failed to save QR/XML files:', err);
    }
  };

  const handleDoneReturnModal = () => {
    setIsReturnModalVisible(false);
    setGeneratedReturn(null);
    dispatch(resetSalesReturn());
    router.replace('/');
  };

  const handleShareXml = async () => {
    if (!generatedReturn?.xml) {
      Alert.alert('No XML', 'No XML available to share yet.');
      return;
    }

    const isSharingAvailable = await Sharing.isAvailableAsync();
    if (!isSharingAvailable) {
      Alert.alert('Unavailable', 'Sharing is not available on this device.');
      return;
    }

    const baseDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
    if (!baseDir) {
      Alert.alert('Error', 'Cannot access local storage to prepare XML file.');
      return;
    }

    const fileUri = `${baseDir}credit-note-${Date.now()}.xml`;
    await FileSystem.writeAsStringAsync(fileUri, generatedReturn.xml, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/xml',
      dialogTitle: 'Share ZATCA Credit Note XML',
      UTI: 'public.xml',
    });
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isProcessing = status === 'saving';

  return (
    <View className="flex-1 flex-row bg-gray-50">
      {/* ─── Left Column: Search + Items ─── */}
      <ScrollView className="flex-1 p-6">
        <Text className="text-2xl font-bold text-gray-800 mb-6">Sales Return</Text>

        {/* Search Bar */}
        <View className="flex-row items-center gap-3 mb-6">
          <View className="flex-1 flex-row items-center bg-white border border-gray-200 rounded-xl px-4 py-3">
            <Ionicons name="search" size={18} color="#9ca3af" />
            <TextInput
              className="flex-1 ml-2 text-sm text-gray-800"
              placeholder="Enter invoice number (e.g. INV-2026-000042 or ACC-SINV-2026-00043)"
              placeholderTextColor="#9ca3af"
              value={searchTerm}
              onChangeText={(text) => dispatch(setSearchTerm(text))}
              onSubmitEditing={handleSearch}
              returnKeyType="search"
              editable={status !== 'saving'}
            />
          </View>
          <TouchableOpacity
            onPress={handleSearch}
            disabled={!searchTerm.trim() || status === 'searching'}
            className={`px-5 py-3 rounded-xl ${searchTerm.trim() ? 'bg-blue-500' : 'bg-gray-300'
              }`}>
            {status === 'searching' ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Text className="text-white font-semibold">Search</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Status Messages */}
        {status === 'idle' && (
          <View className="items-center justify-center py-16 bg-white rounded-xl border border-gray-100">
            <Ionicons name="receipt-outline" size={48} color="#d1d5db" />
            <Text className="text-gray-400 mt-4 text-center">
              Enter an invoice number to begin the return process
            </Text>
          </View>
        )}

        {status === 'not_found' && (
          <View className="items-center justify-center py-16 bg-red-50 rounded-xl border border-red-100">
            <Ionicons name="close-circle-outline" size={48} color="#ef4444" />
            <Text className="text-red-500 mt-4 font-medium">{error}</Text>
          </View>
        )}

        {(status === 'error') && error && (
          <View className="bg-red-50 rounded-xl border border-red-100 p-4 mb-4">
            <Text className="text-red-600 text-sm">{error}</Text>
          </View>
        )}

        {/* Invoice Info + Items */}
        {originalInvoice && (status === 'found' || status === 'saving' || status === 'done') && (
          <View>
            {/* Invoice Header */}
            <View className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <View className="flex-row items-center justify-between mb-2">
                <Text className="text-sm font-bold text-gray-800">Original Invoice</Text>
                <View className="bg-blue-100 rounded-full px-3 py-1">
                  <Text className="text-blue-700 text-xs font-medium">
                    {originalInvoice.invoiceId || originalInvoice.invoiceNo || 'N/A'}
                  </Text>
                </View>
              </View>
              <Text className="text-xs text-gray-500">
                Customer: {originalInvoice.customerId || 'Walk In'} • Date:{' '}
                {originalInvoice.dateTime
                  ? new Date(originalInvoice.dateTime).toLocaleDateString()
                  : 'N/A'}
              </Text>
            </View>

            {/* Available Items */}
            <Text className="text-sm font-bold text-gray-700 mb-3">
              Select items to return ({splitItems.length} items available)
            </Text>

            {splitItems.map((item, index) => {
              const isAdded = returnItems.some((ri) => ri.splitIndex === index);
              const effectiveRate = getEffectiveRate(item.rate, item.discountType, item.discountValue);
              const hasDiscount = item.discountType !== null;

              return (
                <View
                  key={`${item.itemCode}-${index}`}
                  className={`flex-row items-center justify-between p-4 mb-2 rounded-xl border ${isAdded ? 'bg-orange-50 border-orange-200' : 'bg-white border-gray-100'
                    }`}>
                  <View className="flex-1 pr-3">
                    <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
                      {item.itemName || item.itemCode}
                    </Text>
                    <Text className="text-xs text-gray-500">{item.itemCode}</Text>
                    <View className="flex-row items-center mt-1 gap-2">
                      {hasDiscount ? (
                        <>
                          <Text className="text-xs text-gray-400 line-through">
                            {item.rate.toFixed(2)}
                          </Text>
                          <Text className="text-xs text-green-600 font-semibold">
                            {effectiveRate.toFixed(2)} SAR
                          </Text>
                        </>
                      ) : (
                        <Text className="text-xs text-gray-600">
                          {item.rate.toFixed(2)} SAR
                        </Text>
                      )}
                      <Text className="text-xs text-gray-400">× {item.quantity} {item.uom}</Text>
                    </View>
                    {hasDiscount && (
                      <View className="flex-row items-center mt-1">
                        <View className="bg-green-500 rounded px-2 py-0.5 flex-row items-center">
                          <Ionicons name="pricetag" size={8} color="white" />
                          <Text className="text-white text-[10px] font-medium ml-1">
                            {item.discountType === 'PERCENTAGE'
                              ? `${item.discountValue}% OFF`
                              : item.discountType === 'AMOUNT'
                                ? `${item.discountValue} OFF`
                                : 'Special Price'}
                          </Text>
                        </View>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    onPress={() => dispatch(addReturnItem(index))}
                    disabled={isAdded || isProcessing}
                    className={`px-4 py-2 rounded-lg ${isAdded ? 'bg-gray-200' : 'bg-orange-500'
                      }`}>
                    <Text className={`text-xs font-semibold ${isAdded ? 'text-gray-500' : 'text-white'}`}>
                      {isAdded ? 'Added' : 'Return'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}

            {/* Reason & Mobile */}
            <View className="mt-6 gap-4">
              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  Return Reason <Text className="text-red-500">*</Text>
                </Text>
                <TextInput
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800"
                  placeholder="e.g. Damaged product, Wrong item..."
                  placeholderTextColor="#9ca3af"
                  value={reason}
                  onChangeText={(text) => dispatch(setReason(text))}
                  editable={!isProcessing}
                />
                {reason.length > 0 && reason.trim().length < 3 && (
                  <Text className="text-red-400 text-xs mt-1">Minimum 3 characters</Text>
                )}
              </View>

              <View>
                <Text className="text-sm font-medium text-gray-700 mb-1">
                  Customer Mobile <Text className="text-red-500">*</Text>
                </Text>
                <TextInput
                  className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800"
                  placeholder="e.g. 0512345678"
                  placeholderTextColor="#9ca3af"
                  value={mobile}
                  onChangeText={(text) => dispatch(setMobile(text))}
                  keyboardType="phone-pad"
                  maxLength={10}
                  editable={!isProcessing}
                />
                {mobile.length > 0 && mobile.replace(/\D/g, '').length < 9 && (
                  <Text className="text-red-400 text-xs mt-1">Minimum 9 digits</Text>
                )}
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* ─── Right Column: Return Summary ─── */}
      <View className="w-[340px] flex-col h-full bg-white border-l border-gray-200">
        <View className="p-4 border-b border-gray-100">
          <Text className="text-lg font-bold text-gray-800">Return Summary</Text>
        </View>

        <ScrollView className="flex-1 p-4">
          {returnItems.length === 0 ? (
            <View className="items-center justify-center py-10">
              <Ionicons name="arrow-back-circle-outline" size={36} color="#d1d5db" />
              <Text className="text-gray-400 mt-3 text-center text-sm">
                Select items from the invoice to add them to the return
              </Text>
            </View>
          ) : (
            returnItems.map((item, index) => {
              const effectiveRate = getEffectiveRate(item.rate, item.discountType, item.discountValue);
              const lineTotal = item.returnQty * effectiveRate;

              return (
                <View
                  key={`ret-${item.splitIndex}`}
                  className="mb-3 p-3 rounded-lg bg-orange-50 border border-orange-100">
                  <View className="flex-row items-start justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-medium text-gray-800" numberOfLines={1}>
                        {item.itemName || item.itemCode}
                      </Text>
                      <Text className="text-xs text-gray-500 mt-0.5">
                        {effectiveRate.toFixed(2)} SAR × {item.returnQty}
                      </Text>
                    </View>
                    <Text className="text-sm font-bold text-orange-600">
                      {lineTotal.toFixed(2)}
                    </Text>
                  </View>

                  <View className="flex-row items-center justify-between mt-2">
                    {/* Quantity Controls */}
                    <View className="flex-row items-center bg-white rounded-lg border border-gray-200 p-1">
                      <TouchableOpacity
                        onPress={() => dispatch(updateReturnQty({ index, delta: -1 }))}
                        disabled={isProcessing}
                        className="p-1">
                        <Ionicons name="remove" size={16} color="#4b5563" />
                      </TouchableOpacity>
                      <Text className="mx-3 font-medium text-center min-w-[20px]">
                        {item.returnQty}
                      </Text>
                      <TouchableOpacity
                        onPress={() => dispatch(updateReturnQty({ index, delta: 1 }))}
                        disabled={isProcessing}
                        className="p-1">
                        <Ionicons name="add" size={16} color="#4b5563" />
                      </TouchableOpacity>
                      <Text className="text-xs text-gray-400 ml-2">/ {item.availableQty}</Text>
                    </View>

                    <TouchableOpacity
                      onPress={() => dispatch(removeReturnItem(index))}
                      disabled={isProcessing}
                      className="p-1">
                      <Ionicons name="trash-outline" size={18} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Refund Footer */}
        <View className="p-4 bg-gray-50 border-t border-gray-200">
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-500">Items to return</Text>
            <Text className="font-medium">
              {returnItems.reduce((sum, i) => sum + i.returnQty, 0)}
            </Text>
          </View>
          <View className="flex-row justify-between mb-2">
            <Text className="text-gray-500">Payment Mode</Text>
            <Text className="font-medium text-gray-700">Cash (Refund)</Text>
          </View>
          <View className="flex-row justify-between mb-6 pt-4 border-t border-gray-200">
            <Text className="text-lg font-bold text-orange-600">Refund Amount</Text>
            <Text className="text-lg font-bold text-orange-600">{refundAmount.toFixed(2)} SAR</Text>
          </View>

          <TouchableOpacity
            onPress={handleProcessReturn}
            disabled={!canSubmit || isProcessing}
            className={`py-3.5 rounded-xl items-center ${canSubmit && !isProcessing ? 'bg-orange-500' : 'bg-gray-300'
              }`}>
            {isProcessing ? (
              <View className="flex-row items-center gap-2">
                <ActivityIndicator size="small" color="white" />
                <Text className="font-semibold text-white">Processing...</Text>
              </View>
            ) : (
              <Text className="font-semibold text-white">Process Sales Return</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── ZATCA QR Modal ─── */}
      <Modal
        visible={isReturnModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleDoneReturnModal}>
        <View className="flex-1 bg-black/50 items-center justify-center">
          <View className="bg-white rounded-2xl p-8 items-center shadow-xl" style={{ width: 380 }}>
            <View className="bg-green-100 rounded-full p-3 mb-4">
              <Ionicons name="checkmark-circle" size={36} color="#22c55e" />
            </View>
            <Text className="text-xl font-bold text-gray-800 mb-2">Return Processed</Text>
            <Text className="text-gray-500 text-sm text-center mb-6">
              Credit note has been generated and saved.{'\n'}
              Refund: {refundAmount.toFixed(2)} SAR
            </Text>

            {generatedReturn?.qrData && (
              <View className="mb-6">
                <InvoiceQR
                  qrData={generatedReturn.qrData}
                  size={180}
                  onCapturePng={handleQRCapture}
                />
              </View>
            )}

            <View className="flex-row gap-3 w-full">
              <TouchableOpacity
                onPress={handleShareXml}
                className="flex-1 flex-row items-center justify-center bg-blue-500 py-3 rounded-xl gap-2">
                <Ionicons name="share-outline" size={18} color="white" />
                <Text className="font-semibold text-white">Share XML</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleDoneReturnModal}
                className="flex-1 bg-green-500 py-3 rounded-xl items-center">
                <Text className="font-semibold text-white">Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
