/** A flat product row joined with a single UOM entry.
 *  Every product has at least one UOM, so UOM fields are non-nullable. */
export type ProductWithUom = {
  id: number;
  itemId: string | null;
  name: string | null;
  localizedEnglishName: string | null;
  itemCode: string | null;
  price: number | null;
  taxPercentage: number | null;
  isDisabled: boolean | null;
  categoryId: string | null;
  // UOM fields (always present — every product has at least one UOM)
  uomId: string;
  uom: string | null;
  conversionFactor: number | null;
  uomPrice: number | null;
  isPriceEditable: boolean | null;
  isQuantityEditable: boolean | null;
};
