// API Response Types for get_items endpoint

export interface ApiBarcode {
  id: string;
  barcode: string;
  uom: string;
}

export interface ApiUom {
  id: string;
  uom: string;
  conversion_factor: number;
  price: number;
  barcode: string;
  editable_price: boolean;
  editable_quantity: boolean;
}

export interface ApiItem {
  item_id: string;
  item_code: string;
  item_name: string;
  item_name_english: string;
  item_name_arabic: string;
  tax_percentage: number;
  description: string;
  disabled: number;
  barcodes: ApiBarcode[];
  uom: ApiUom[];
}

export interface ApiItemGroup {
  item_group_id: string;
  item_group: string;
  item_group_disabled: boolean;
  items: ApiItem[];
  disabled: number;
}

export interface GetItemsResponse {
  data: ApiItemGroup[];
}
