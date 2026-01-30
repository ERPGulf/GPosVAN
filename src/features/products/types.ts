export interface Product {
  item_code: string;
  item_name: string;
  description: string;
  stock_uom: string;
  image: string | null;
  is_stock_item: number;
  has_variants: number;
  variant_of: string | null;
  item_group: string;
  idx: number;
  has_batch_no: number;
  has_serial_no: number;
  max_discount: number;
  brand: string;
  manufacturer_part_no: string;
  rate: number;
  currency: string;
  item_barcode: any[];
  actual_qty: number;
  serial_no_data: any[];
  batch_no_data: any[];
  attributes: string;
  item_attributes: string;
  item_manufacturer_part_no: string;
  alternative_items: any[];
  wholesale_rate: number;
  wholesale_rate2: number;
  wholesale_rate3: string;
}

export const MOCK_PRODUCTS: Product[] = [
  {
    item_code: 'U I EMK 000001',
    item_name: ' A/C oil Compressor refrigeration lubricant  زيت كمبروسر ',
    description: 'A/C oil Compressor زيت كمبروسر',
    stock_uom: 'Piece',
    image: null,
    is_stock_item: 1,
    has_variants: 0,
    variant_of: null,
    item_group: 'Products',
    idx: 0,
    has_batch_no: 0,
    has_serial_no: 0,
    max_discount: 0,
    brand: 'emkarate',
    manufacturer_part_no: 'RL 68H',
    rate: 170,
    currency: 'SAR',
    item_barcode: [],
    actual_qty: -2,
    serial_no_data: [],
    batch_no_data: [],
    attributes: '',
    item_attributes: '',
    item_manufacturer_part_no: 'RL 68H',
    alternative_items: [],
    wholesale_rate: 170,
    wholesale_rate2: 0,
    wholesale_rate3: '0.000000000',
  },
  {
    item_code: 'T OY 000001',
    item_name: 'Brake Pads Front - Toyota Camry',
    description: 'Brake Pads Front for Toyota Camry 2018-2023',
    stock_uom: 'Set',
    image: null,
    is_stock_item: 1,
    has_variants: 0,
    variant_of: null,
    item_group: 'Braking System',
    idx: 0,
    has_batch_no: 0,
    has_serial_no: 0,
    max_discount: 5,
    brand: 'Toyota',
    manufacturer_part_no: '04465-33470',
    rate: 250,
    currency: 'SAR',
    item_barcode: [],
    actual_qty: 15,
    serial_no_data: [],
    batch_no_data: [],
    attributes: '',
    item_attributes: '',
    item_manufacturer_part_no: '04465-33470',
    alternative_items: [],
    wholesale_rate: 220,
    wholesale_rate2: 0,
    wholesale_rate3: '0.000000000',
  },
  {
    item_code: 'NGK 000001',
    item_name: 'Spark Plug Iridium',
    description: 'Spark Plug Iridium IX',
    stock_uom: 'Piece',
    image: null,
    is_stock_item: 1,
    has_variants: 0,
    variant_of: null,
    item_group: 'Ignition',
    idx: 0,
    has_batch_no: 0,
    has_serial_no: 0,
    max_discount: 0,
    brand: 'NGK',
    manufacturer_part_no: 'BKR6EIX',
    rate: 45,
    currency: 'SAR',
    item_barcode: [],
    actual_qty: 100,
    serial_no_data: [],
    batch_no_data: [],
    attributes: '',
    item_attributes: '',
    item_manufacturer_part_no: 'BKR6EIX',
    alternative_items: [],
    wholesale_rate: 40,
    wholesale_rate2: 0,
    wholesale_rate3: '0.000000000',
  },
  {
    item_code: 'MOB 000001',
    item_name: 'Mobil 1 5W-30 Synthetic Motor Oil',
    description: 'Advanced Full Synthetic Motor Oil',
    stock_uom: 'Liter',
    image: null,
    is_stock_item: 1,
    has_variants: 0,
    variant_of: null,
    item_group: 'Lubricants',
    idx: 0,
    has_batch_no: 1,
    has_serial_no: 0,
    max_discount: 0,
    brand: 'Mobil 1',
    manufacturer_part_no: '12345',
    rate: 55,
    currency: 'SAR',
    item_barcode: [],
    actual_qty: 50,
    serial_no_data: [],
    batch_no_data: [],
    attributes: '',
    item_attributes: '',
    item_manufacturer_part_no: '12345',
    alternative_items: [],
    wholesale_rate: 50,
    wholesale_rate2: 0,
    wholesale_rate3: '0.000000000',
  },
  {
    item_code: 'BOS 000001',
    item_name: 'Bosch Oil Filter',
    description: 'Oil Filter for various models',
    stock_uom: 'Piece',
    image: null,
    is_stock_item: 1,
    has_variants: 0,
    variant_of: null,
    item_group: 'Filters',
    idx: 0,
    has_batch_no: 0,
    has_serial_no: 0,
    max_discount: 0,
    brand: 'Bosch',
    manufacturer_part_no: '72233',
    rate: 25,
    currency: 'SAR',
    item_barcode: [],
    actual_qty: 30,
    serial_no_data: [],
    batch_no_data: [],
    attributes: '',
    item_attributes: '',
    item_manufacturer_part_no: '72233',
    alternative_items: [],
    wholesale_rate: 20,
    wholesale_rate2: 0,
    wholesale_rate3: '0.000000000',
  },
];
