// ─── Loyalty Points API Response Types ───────────────────────────────────────

/** Response from gpos.gpos.pos.get_loyalty_points */
export interface LoyaltyPointsData {
  customer_id: string;
  customer_number: string;
  loyalty_points: number;
  Amount: number; // SAR equivalent of points
}

export interface LoyaltyPointsResponse {
  data: LoyaltyPointsData;
}

/** Response from gpos.gpos.pos.generate_otp */
export interface GenerateOtpData {
  otp: string;
}

export interface GenerateOtpResponse {
  data: GenerateOtpData;
}

/** Response from gpos.gpos.pos.validate_otp */
export interface ValidateOtpResponse {
  data: {
    status: 'success' | string;
    message: string;
  };
}

// ─── Loyalty Redux State ─────────────────────────────────────────────────────

export interface LoyaltyState {
  loyaltyAmount: number; // SAR amount to deduct from invoice
  loyaltyPoints: number; // Number of points being redeemed
  customerMobile: string; // Mobile number used for loyalty lookup
  isApplied: boolean; // Whether loyalty has been verified & applied
}
