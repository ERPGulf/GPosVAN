const zatcaConfig = {
  discount_field: 0,
  prefix_included_or_not: 0,
  no_of_prefix_character: 3,
  prefix: 'ITM',

  item_code_total_digits: 6,
  item_code_starting_position: 4,

  weight_starting_position: 10,
  weight_total_digitsexcluding_decimal: 6,
  no_of_decimal_in_weights: 3,

  price_included_in_barcode_or_not: 0,
  price_starting_position: 20,
  price_total_digitsexcluding_decimals: 6,
  no_of_decimal_in_price: 3,

  inclusive: 0,
  tax_percentage: 0,

  phase: 'Phase-2',

  company_name_in_arabic: null,

  zatca: {
    company_name: 'erpgulf',

    tax_id: '399999999900003',

    company_registration_no: '1234567',

    Abbr: 'e',

    certificate: process.env.EXPO_PUBLIC_ZATCA_CERTIFICATE,

    private_key: process.env.EXPO_PUBLIC_ZATCA_PRIVATE_KEY,

    public_key: process.env.EXPO_PUBLIC_ZATCA_PUBLIC_KEY,

    pih: process.env.EXPO_PUBLIC_ZATCA_PIH,

    address: {
      address_line1: null,
      city: null,
      county: null,
      state: null,
      pincode: null,
      building_number: null,
    },
  },

  cardpay_settings: {
    secret_key: null,
    api_key: null,
    merchant_id: null,
    connection_type: 'IP',
    company: 'GEIDEA',
  },

  branch_details: {
    card_machine: false,
  },
};

export default zatcaConfig;
