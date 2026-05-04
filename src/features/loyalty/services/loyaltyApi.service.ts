import { apiClient } from '@/src/services/api/httpClient';
import type { GenerateOtpResponse, LoyaltyPointsResponse, ValidateOtpResponse } from '../types';

// ─── Get Loyalty Points ──────────────────────────────────────────────────────

/**
 * Fetch a customer's loyalty points balance by mobile number.
 * API: POST gpos.gpos.pos.get_loyalty_points
 */
export const getLoyaltyPoints = async (
  mobileNo: string,
): Promise<LoyaltyPointsResponse['data']> => {
  const formData = new URLSearchParams();
  formData.append('customer_number', mobileNo);

  if (__DEV__) {
    console.log('[LoyaltyApi] Fetching loyalty points for:', mobileNo);
  }

  try {
    const response = await apiClient.post<LoyaltyPointsResponse>(
      '/gpos.gpos.pos.get_loyalty_points',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (__DEV__) {
      console.log('[LoyaltyApi] Loyalty points response:', response.data.data);
    }

    return response.data.data;
  } catch (error: any) {
    if (__DEV__) {
      console.error(
        '[LoyaltyApi] Failed to fetch loyalty points:',
        error?.response?.data || error.message,
      );
    }
    throw error;
  }
};

// ─── Generate OTP ────────────────────────────────────────────────────────────

/**
 * Send an OTP to the customer's mobile number for loyalty redemption.
 * API: POST gpos.gpos.pos.generate_otp
 */
export const generateOtp = async (mobileNo: string): Promise<void> => {
  const formData = new URLSearchParams();
  formData.append('mobile_no', mobileNo);

  if (__DEV__) {
    console.log('[LoyaltyApi] Generating OTP for:', mobileNo);
  }

  try {
    const response = await apiClient.post<GenerateOtpResponse>(
      '/gpos.gpos.pos.generate_otp',
      formData.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    if (__DEV__) {
      console.log(response?.data);
      console.log('[LoyaltyApi] OTP sent successfully');
    }
  } catch (error: any) {
    if (__DEV__) {
      console.error('[LoyaltyApi] Failed to generate OTP:', error?.response?.data || error.message);
    }
    throw error;
  }
};

// ─── Validate OTP (Server-side) ──────────────────────────────────────────────

/**
 * Validate the OTP entered by the cashier against the server.
 * API: GET gpos.gpos.pos.validate_otp
 * Returns true if OTP is valid, false otherwise.
 */
export const validateOtp = async (mobileNo: string, otp: string): Promise<boolean> => {
  if (__DEV__) {
    console.log('[LoyaltyApi] Validating OTP for:', mobileNo);
  }

  try {
    const response = await apiClient.get<ValidateOtpResponse>('/gpos.gpos.pos.validate_otp', {
      params: {
        mobile_no: mobileNo,
        otp,
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    const isValid = response.data.data.status === 'success';

    if (__DEV__) {
      console.log('[LoyaltyApi] OTP validation result:', {
        status: response.data.data.status,
        message: response.data.data.message,
        isValid,
      });
    }

    return isValid;
  } catch (error: any) {
    if (__DEV__) {
      console.error('[LoyaltyApi] Failed to validate OTP:', error?.response?.data || error.message);
    }
    throw error;
  }
};
