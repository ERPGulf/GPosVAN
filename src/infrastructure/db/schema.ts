import * as Crypto from 'expo-crypto';
import { relations } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('Users', {
  id: text('id').primaryKey(),
  username: text('username'),
  password: text('password'),
  email: text('email'),
  address: text('address'),
  shopName: text('shop_name'),
  invoiceTemplate: text('invoice_template'),
  isAdmin: integer('is_admin', { mode: 'boolean' }),
  posProfile: text('pos_profile', { mode: 'json' }).$type<string[]>(),
  cashierName: text('cashier_name'),
});

// Customer table
export const customers = sqliteTable('Customers', {
  id: text('id').primaryKey(),
  name: text('name'),
  phoneNo: text('phone_no').unique(), // Unique for upsert by phone
  isDefault: integer('is_default', { mode: 'boolean' }),
  isDisabled: integer('is_disabled', { mode: 'boolean' }),
  vatNumber: text('vat_number'),
  addressLine1: text('address_line_1'),
  addressLine2: text('address_line_2'),
  buildingNo: text('building_no'),
  poBoxNo: text('po_box_no'),
  city: text('city'),
  company: text('company'),
  customerGroup: text('customer_group'),
  customerRegistrationNo: text('customer_registration_no'),
  customerRegistrationType: text('customer_registration_type'),
  // Sync status: 'pending' | 'synced' | 'failed'
  syncStatus: text('sync_status').default('synced'),
});

// Category table
export const categories = sqliteTable('Category', {
  id: text('id').primaryKey(),
  name: text('name'),
  isDisabled: integer('is_disabled', { mode: 'boolean' }),
});

// Product table
export const products = sqliteTable('Product', {
  id: integer('id').primaryKey(),
  itemId: text('item_id'),
  name: text('name'),
  localizedEnglishName: text('localized_english_name'),
  itemCode: text('item_code'),
  price: real('price'),
  taxPercentage: real('tax_percentage'),
  isDisabled: integer('is_disabled', { mode: 'boolean' }),
  categoryId: text('category_id').references(() => categories.id),
});

// Product relations
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  barCodes: many(barcodes),
  unitOfMeasures: many(unitOfMeasures),
}));

// Barcode table
export const barcodes = sqliteTable('Barcode', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => Crypto.randomUUID()),
  barCode: text('bar_code'),
  uom: text('uom'),
  productId: integer('product_id').references(() => products.id),
});

// Barcode relations
export const barcodesRelations = relations(barcodes, ({ one }) => ({
  product: one(products, {
    fields: [barcodes.productId],
    references: [products.id],
  }),
}));

// UnitOfMeasure table
export const unitOfMeasures = sqliteTable('UnitOfMeasure', {
  id: text('id').primaryKey(),
  uom: text('uom'),
  conversionFactor: real('conversion_factor'),
  amount: real('amount'),
  isPriceEditable: integer('is_price_editable', { mode: 'boolean' }),
  isQuantityEditable: integer('is_quantity_editable', { mode: 'boolean' }),
  lastUpdated: integer('last_updated', { mode: 'timestamp' }),
  productId: integer('product_id').references(() => products.id),
});

// UnitOfMeasure relations
export const unitOfMeasuresRelations = relations(unitOfMeasures, ({ one }) => ({
  product: one(products, {
    fields: [unitOfMeasures.productId],
    references: [products.id],
  }),
}));

// Category relations
export const categoriesRelations = relations(categories, ({ many }) => ({
  products: many(products),
}));

// Shift table
export const shifts = sqliteTable('Shifts', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => Crypto.randomUUID()),
  shiftLocalId: text('shift_local_id'),
  userId: text('user_id'),
  openingCash: real('opening_cash').default(0),
  shiftStartDate: integer('shift_start_date', { mode: 'timestamp' }).notNull(),
  closingShiftDate: integer('closing_shift_date', { mode: 'timestamp' }),
  closingCash: real('closing_cash').default(0),
  closingExpectedCash: real('closing_expected_cash').default(0),
  closingExpectedCard: real('closing_expected_card').default(0),
  closingCard: real('closing_card').default(0),
  claimedLoyalityAmount: real('claimed_loyality_amount').default(0),
  isOpeningSynced: integer('is_opening_synced', { mode: 'boolean' }).default(false),
  isClosingSynced: integer('is_closing_synced', { mode: 'boolean' }).default(false),
  shiftOpeningId: text('shift_opening_id'),
  branch: text('branch'),
  isShiftClosed: integer('is_shift_closed', { mode: 'boolean' }).default(false),
  salesReturn: real('sales_return').default(0),
});

// ShiftIdSequence table
export const shiftIdSequence = sqliteTable('ShiftsIdSequence', {
  userId: text('user_id').primaryKey(),
  sequence: integer('sequence').default(0),
});

// Invoice table
export const invoices = sqliteTable('Invoice', {
  id: text('id').primaryKey(), // used as sync id
  invoiceId: text('invoice_id'), // server-side id after ERP sync
  invoiceNo: text('invoice_no'), // generated for ZATCA XML
  customerId: text('customer_id'), // soft FK → customers
  customerPurchaseOrder: integer('customer_purchase_order').default(0), //invoice lineItem count
  discount: real('discount').default(0),
  previousInvoiceHash: text('previous_invoice_hash'),
  isSynced: integer('is_synced', { mode: 'boolean' }).default(false),
  dateTime: integer('date_time', { mode: 'timestamp' }).notNull(),
  syncDateTime: integer('sync_date_time', { mode: 'timestamp' }),
  posProfile: text('pos_profile'),
  loyalityCustomerName: text('loyality_customer_name'),
  loyalityCustomerMobile: text('loyality_customer_mobile'),
  shiftId: text('shift_id'), // soft FK → shifts
  userId: text('user_id'), // soft FK → users
  isError: integer('is_error', { mode: 'boolean' }).default(false),
  isErrorSynced: integer('is_error_synced', { mode: 'boolean' }).default(false),
  errorSyncTime: integer('error_sync_time', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
});

// Invoice relations
export const invoicesRelations = relations(invoices, ({ many }) => ({
  items: many(invoiceItems),
  payments: many(invoicePayments),
}));

// InvoiceItems table
export const invoiceItems = sqliteTable('InvoiceItems', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  itemCode: text('item_code'),
  itemName: text('item_name'),
  quantity: real('quantity').default(0),
  rate: real('rate').default(0),
  taxPercentage: real('tax_percentage').default(0),
  unitOfMeasure: text('unit_of_measure'),
  invoiceEntityId: text('invoice_entity_id').references(() => invoices.id),
  discountType: text('discount_type'),
  minQty: integer('min_qty').default(0),
  maxQty: integer('max_qty').default(0),
  discountValue: real('discount_value').default(0),
});

// InvoiceItems relations
export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceEntityId],
    references: [invoices.id],
  }),
}));

// InvoicePayments table
export const invoicePayments = sqliteTable('InvoicePayments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  modeOfPayment: text('mode_of_payment'),
  amount: real('amount').default(0),
  invoiceEntityId: text('invoice_entity_id').references(() => invoices.id),
  userId: text('user_id'),
  transactionId: text('transaction_id'),
  createAt: integer('create_at', { mode: 'timestamp' }),
});

// InvoicePayments relations
export const invoicePaymentsRelations = relations(invoicePayments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [invoicePayments.invoiceEntityId],
    references: [invoices.id],
  }),
}));

// InvoiceIdSequence table — single global row tracking the invoice counter
export const invoiceIdSequence = sqliteTable('InvoiceIdSequence', {
  id: integer('id').primaryKey(), // always row id = 1
  sequence: integer('sequence').default(0),
});

// Promotion table
export const promotions = sqliteTable('Promotions', {
  promotionId: text('PromotionId').primaryKey(),
  disabled: integer('Disabled', { mode: 'boolean' }).default(false),
  validFrom: text('ValidFrom').notNull(),
  validUpto: text('ValidUpto').notNull(),
});

// Promotion relations
export const promotionsRelations = relations(promotions, ({ many }) => ({
  items: many(promotionItems),
}));

// PromotionItems table
export const promotionItems = sqliteTable('PromotionItems', {
  id: text('ItemId').primaryKey(),
  itemCode: text('ItemCode').notNull(),
  itemName: text('ItemName'),
  discountType: text('DiscountType'),
  minQty: integer('MinQty').default(0),
  maxQty: integer('MaxQty').default(0),
  discountPercentage: real('DiscountPercentage').default(0),
  discountPrice: real('DiscountPrice').default(0),
  rate: real('Rate').default(0),
  uomId: text('UomId'),
  uom: text('uom'),
  createOn: integer('CreateOn', { mode: 'timestamp' }),
  updatedOn: integer('UpdatedOn', { mode: 'timestamp' }),
  promotionId: text('PromotionId').references(() => promotions.promotionId),
});

// PromotionItems relations
export const promotionItemsRelations = relations(promotionItems, ({ one }) => ({
  promotion: one(promotions, {
    fields: [promotionItems.promotionId],
    references: [promotions.promotionId],
  }),
}));
