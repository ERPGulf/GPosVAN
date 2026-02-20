import { NewCustomer } from '@/src/infrastructure/db/customers.repository';
import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import React, { useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
    ActivityIndicator,
    Alert,
    Modal,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    View,
} from 'react-native';
import * as yup from 'yup';
import { CreateCustomerError, useCreateCustomer } from '../hooks/useCreateCustomer';

// Validation schema
const customerSchema = yup.object({
    name: yup.string().required('Customer name is required'),
    phoneNo: yup.string().required('Mobile number is required'),
    vatNumber: yup.string().required('VAT number is required'),
    addressLine1: yup.string().required('Address line 1 is required'),
    addressLine2: yup.string().required('Address line 2 is required'),
    buildingNo: yup.string()
        .required('Building number is required')
        .max(4, 'Building number must be at most 4 characters'),
    city: yup.string().required('City is required'),
    poBoxNo: yup.string().required('PO Box number is required'),
    company: yup.string().required('Company is required'),
});

type FormData = yup.InferType<typeof customerSchema>;

interface AddCustomerModalProps {
    visible: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const AddCustomerModal = ({ visible, onClose, onSuccess }: AddCustomerModalProps) => {
    const createCustomer = useCreateCustomer();
    const isSubmittingRef = useRef(false);

    const {
        control,
        handleSubmit,
        reset,
        setError,
        formState: { errors },
    } = useForm<FormData>({
        resolver: yupResolver(customerSchema),
        defaultValues: {
            name: '',
            phoneNo: '',
            vatNumber: '',
            addressLine1: '',
            addressLine2: '',
            buildingNo: '',
            city: '',
            poBoxNo: '',
            company: '',
        },
    });

    const onSubmit = async (data: FormData) => {
        // Prevent double submission
        if (createCustomer.isPending) {
            console.log('[AddCustomerModal] Already submitting, ignoring...');
            return;
        }

        console.log('[AddCustomerModal] onSubmit called with data:', data);
        try {
            const customer: NewCustomer = {
                name: data.name,
                phoneNo: data.phoneNo,
                vatNumber: data.vatNumber,
                addressLine1: data.addressLine1,
                addressLine2: data.addressLine2,
                buildingNo: data.buildingNo,
                city: data.city,
                poBoxNo: data.poBoxNo,
                company: data.company,
            };

            console.log('[AddCustomerModal] Calling mutateAsync with customer:', customer);
            const result = await createCustomer.mutateAsync(customer);
            console.log('[AddCustomerModal] Customer created successfully with ID:', result);

            // Check if customer was synced or saved locally only
            if (result.startsWith('TEMP_')) {
                Alert.alert(
                    'Saved Locally',
                    'Customer saved locally but could not sync to server. It will sync when you\'re back online.',
                    [{ text: 'OK' }]
                );
            }

            reset();
            onSuccess?.();
            onClose();
        } catch (error) {
            console.error('[AddCustomerModal] Error creating customer:', error);
            const customerError = error as CreateCustomerError;
            if (customerError.type === 'duplicate') {
                setError(customerError.field, { message: customerError.message });
            }
        }
    };

    const handleClose = () => {
        reset();
        createCustomer.reset();
        onClose();
    };

    const renderInput = (
        name: keyof FormData,
        label: string,
        placeholder: string,
        keyboardType: 'default' | 'phone-pad' = 'default',
    ) => (
        <View className="mb-4">
            <Text className="text-gray-700 font-medium mb-1">{label}</Text>
            <Controller
                control={control}
                name={name}
                render={({ field: { onChange, onBlur, value } }) => (
                    <TextInput
                        className={`border rounded-lg px-3 py-3 text-gray-800 ${errors[name] ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
                            }`}
                        placeholder={placeholder}
                        placeholderTextColor="#9ca3af"
                        value={value}
                        onChangeText={onChange}
                        onBlur={onBlur}
                        keyboardType={keyboardType}
                    />
                )}
            />
            {errors[name] && (
                <Text className="text-red-500 text-sm mt-1">{errors[name]?.message}</Text>
            )}
        </View>
    );

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <View className="flex-1 bg-black/50 justify-center items-center p-4">
                <View className="bg-white rounded-2xl w-full max-w-lg max-h-[90%]">
                    {/* Header */}
                    <View className="flex-row items-center justify-between p-4 border-b border-gray-200">
                        <Text className="text-xl font-bold text-gray-800">Add New Customer</Text>
                        <Pressable onPress={handleClose} className="p-2">
                            <Ionicons name="close" size={24} color="#6b7280" />
                        </Pressable>
                    </View>

                    {/* Form */}
                    <ScrollView className="p-4" showsVerticalScrollIndicator={false}>
                        {renderInput('name', 'Customer Name *', 'Enter customer name')}
                        {renderInput('phoneNo', 'Mobile Number *', 'Enter mobile number', 'phone-pad')}
                        {renderInput('vatNumber', 'VAT Number *', 'Enter VAT number')}
                        {renderInput('company', 'Company *', 'Enter company name')}
                        {renderInput('addressLine1', 'Address Line 1 *', 'Enter address')}
                        {renderInput('addressLine2', 'Address Line 2 *', 'Enter address')}
                        {renderInput('buildingNo', 'Building Number *', 'Enter building number')}
                        {renderInput('city', 'City *', 'Enter city')}
                        {renderInput('poBoxNo', 'PO Box Number *', 'Enter PO Box number')}

                        {/* Spacer for scroll */}
                        <View className="h-4" />
                    </ScrollView>

                    {/* Footer */}
                    <View className="flex-row gap-3 p-4 border-t border-gray-200">
                        <Pressable
                            onPress={handleClose}
                            className="flex-1 py-3 rounded-lg border border-gray-300 items-center"
                        >
                            <Text className="text-gray-700 font-semibold">Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => {
                                console.log('[AddCustomerModal] Save button pressed');
                                console.log('[AddCustomerModal] Current errors:', errors);
                                handleSubmit(
                                    onSubmit,
                                    (validationErrors) => {
                                        console.log('[AddCustomerModal] Validation failed:', validationErrors);
                                    }
                                )();
                            }}
                            disabled={createCustomer.isPending}
                            className={`flex-1 py-3 rounded-lg items-center ${createCustomer.isPending ? 'bg-green-300' : 'bg-green-500 active:bg-green-600'
                                }`}
                        >
                            {createCustomer.isPending ? (
                                <ActivityIndicator color="#ffffff" />
                            ) : (
                                <Text className="text-white font-semibold">Save Customer</Text>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
};
