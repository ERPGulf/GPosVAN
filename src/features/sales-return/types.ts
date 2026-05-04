/**
 * Sales Return Types
 *
 * Re-exports shared types from the repository and defines
 * any additional UI-specific types needed by the sales return slice and page.
 */

// Re-export core types from the repository layer
export type {
  SplitInvoiceItem,
  ReturnItem,
  OriginalInvoice,
} from '@/src/infrastructure/db/salesReturn.repository';

/**
 * A return item in the UI — extends SplitInvoiceItem with editable return quantity.
 * The `returnQty` is set by the user via +/− controls.
 */
export interface ReturnLineItem {
  /** Index into the splitItems array for reference */
  splitIndex: number;
  itemCode: string;
  itemName: string;
  /** Available quantity from the original invoice (positive) */
  availableQty: number;
  /** How many to return (positive, 1 ≤ returnQty ≤ availableQty) */
  returnQty: number;
  /** Original rate (before discount) */
  rate: number;
  taxRate: number;
  uom: string;
  discountType: string | null;
  discountValue: number;
  minQty: number;
  maxQty: number;
}
