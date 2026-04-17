export interface ZatcaAddress {
  address_line1: string | null;
  city: string | null;
  county: string | null;
  state: string | null;
  pincode: string | number | null;
  country: string | null;
  building_number: string | number | null;
}

export interface ZatcaSettings {
  company_name: string;
  phase: string;
  tax_id: string;
  company_taxid: string;
  company_registration_no: string;
  Abbr: string;
  linked_doctype: string;
  certificate?: string;
  private_key?: string;
  public_key?: string;
  pih?: string;
  address: ZatcaAddress;
}

export interface CardpaySettings {
  id: string;
  secret_key: string | null;
  api_key: string | null;
  merchant_id: string | null;
  connection_type: string;
  company: string;
  url: string | null;
}

export interface BranchDetails {
  branch_name: string | null;
  address1: string | null;
  address2: string | null;
  building_no: string | null;
  pb_no: string | null;
  phone: string | null;
  card_machine: boolean;
}

export interface ScaleSettings {
  prefix_included_or_not: number;
  no_of_prefix_characters: number;
  prefix: string;
  item_code_total_digits: number;
  item_code_starting_position: number;
  weight_starting_position: number;
  weight_total_digits_excluding_decimal: number;
  no_of_decimal_in_weights: number;
  price_included_in_barcode_or_not: number;
  price_starting_position: number;
  price_total_digits_excluding_decimals: number;
  no_of_decimal_in_price: number;
}

export interface TaxEntry {
  [key: string]: unknown;
}

export interface AppConfig {
  phase: string;
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

  show_item_pictures: boolean;
  inclusive: number;
  post_to_sales_invoice: number;
  post_to_pos_invoice: number;
  is_tax_included_in_price: number;
  tax_percentage: number;

  company_name_in_arabic: string | null;

  zatca: ZatcaSettings;
  cardpay_settings: CardpaySettings;
  taxes: TaxEntry[];
  branch_details: BranchDetails;
  scale_settings: ScaleSettings;
}
