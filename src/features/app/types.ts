export interface ZatcaAddress {
  address_line1: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  pincode: string | null;
  building_number: string | null;
}

export interface ZatcaSettings {
  company_name: string;
  tax_id: string;
  company_registration_no: string;
  Abbr: string;
  certificate?: string;
  private_key?: string;
  public_key?: string;
  pih?: string;
  address: ZatcaAddress;
}

export interface CardpaySettings {
  secret_key: string | null;
  api_key: string | null;
  merchant_id: string | null;
  connection_type: string;
  company: string;
}

export interface BranchDetails {
  card_machine: boolean;
}

export interface AppConfig {
  discount_field: number;
  prefix_included_or_not: number;
  no_of_prefix_character: number;
  prefix: string;

  item_code_total_digits: number;
  item_code_starting_position: number;

  weight_starting_position: number;
  weight_total_digitsexcluding_decimal: number;
  no_of_decimal_in_weights: number;

  price_included_in_barcode_or_not: number;
  price_starting_position: number;
  price_total_digitsexcluding_decimals: number;
  no_of_decimal_in_price: number;

  inclusive: number;
  tax_percentage: number;

  phase: string;

  company_name_in_arabic: string | null;

  zatca: ZatcaSettings;
  cardpay_settings: CardpaySettings;
  branch_details: BranchDetails;
}
