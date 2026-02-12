// API Response Types for customer_list endpoint

export interface ApiCustomer {
  id: string;
  customer_name: string;
  mobile_no: string | null;
  email_id: string | null;
  tax_id: string | null;
  customer_group: string | null;
  territory: string | null;
  customer_primary_address: string | null;
  custom_default_pos: number;
  disabled: number;
  custom_b2c: number;
  custom_buyer_id_type: 'TIN' | 'CRN';
  custom_buyer_id: string | null;
}

export interface GetCustomerListResponse {
  data: ApiCustomer[];
}

// Create Customer API Types
export interface CreateCustomerParams {
  customer_name: string;
  mobile_no: string;
  address_line1: string;
  address_line2: string;
  vat_number: string;
  building_number: string;
  company: string;
  city: string;
  pb_no: string;
}

export interface CreateCustomerResponse {
  message: string;
  data?: {
    id: string;
    customer_name: string;
  };
}
