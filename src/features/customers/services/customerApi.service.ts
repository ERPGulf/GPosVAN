import { apiClient } from '@/src/services/api/httpClient';
import { AxiosError } from 'axios';
import {
  CreateCustomerParams,
  CreateCustomerResponse,
  GetCustomerListResponse,
} from '../types/customerApi.types';

/**
 * Fetch all customers from the API
 * @returns Promise with the API response containing customer list
 */
export const fetchCustomers = async (): Promise<GetCustomerListResponse> => {
  try {
    const response = await apiClient.get<GetCustomerListResponse>('/gpos.gpos.pos.customer_list');
    return response.data;
  } catch (error) {
    console.error('Error fetching customers:', error);
    throw error;
  }
};

/**
 * Extract error message from API error response
 */
const getApiErrorMessage = (error: unknown): string => {
  if (error instanceof AxiosError) {
    // Try to get error message from response data
    const responseData = error.response?.data;
    if (responseData?.message) return responseData.message;
    if (responseData?.exc_type) return `${responseData.exc_type}: ${responseData.exception || ''}`;
    if (responseData?.error) return responseData.error;
    if (typeof responseData === 'string') return responseData;
    // Fallback to HTTP status
    return `API Error: ${error.response?.status} ${error.response?.statusText || ''}`;
  }
  if (error instanceof Error) return error.message;
  return 'Unknown error occurred';
};

/**
 * Create a new customer
 * @param params - Customer creation parameters
 * @returns Promise with the API response
 */
export const createCustomer = async (
  params: CreateCustomerParams,
): Promise<CreateCustomerResponse> => {
  try {
    const formData = new FormData();

    formData.append('customer_name', params.customer_name);
    formData.append('mobile_no', params.mobile_no);
    formData.append('address_line1', params.address_line1);
    formData.append('address_line2', params.address_line2);
    formData.append('vat_number', params.vat_number);
    formData.append('building_number', params.building_number);
    formData.append('company', params.company);
    formData.append('city', params.city);
    formData.append('pb_no', params.pb_no);

    const response = await apiClient.post<CreateCustomerResponse>(
      '/gpos.gpos.pos.create_customer_new',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    );

    return response.data;
  } catch (error) {
    const errorMessage = getApiErrorMessage(error);
    console.error('[CreateCustomer] API error:', errorMessage);
    console.error('[CreateCustomer] Full error:', error);
    // Re-throw with a more descriptive error
    throw new Error(errorMessage);
  }
};
