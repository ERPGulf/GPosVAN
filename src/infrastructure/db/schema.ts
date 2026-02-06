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
    .$defaultFn(() => crypto.randomUUID()),
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
