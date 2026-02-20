import { fetchProducts } from '@/src/features/products/services/productApi.service';
import { ProductWithUom } from '@/src/features/products/types/product.types';
import { ApiItemGroup, GetItemsResponse } from '@/src/features/products/types/productApi.types';
import { eq, getTableColumns, sql, SQL } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { barcodes, categories, products, unitOfMeasures } from './schema';

/**
 * Build conflict update columns for upsert operations.
 * Uses the excluded keyword to reference the incoming row's values.
 */
const buildConflictUpdateColumns = <T extends SQLiteTable, Q extends keyof T['_']['columns']>(
  table: T,
  columns: Q[],
) => {
  const cls = getTableColumns(table);
  return columns.reduce(
    (acc, column) => {
      const colName = cls[column].name;
      acc[column] = sql.raw(`excluded.${colName}`);
      return acc;
    },
    {} as Record<Q, SQL>,
  );
};

/**
 * Sync categories from API response to the database.
 */
const syncCategories = async (
  db: ExpoSQLiteDatabase,
  itemGroups: ApiItemGroup[],
): Promise<void> => {
  if (!itemGroups || itemGroups.length === 0) return;

  const categoryData = itemGroups.map((group) => ({
    id: group.item_group_id,
    name: group.item_group,
    isDisabled: group.item_group_disabled,
  }));

  await db
    .insert(categories)
    .values(categoryData)
    .onConflictDoUpdate({
      target: categories.id,
      set: buildConflictUpdateColumns(categories, ['name', 'isDisabled']),
    });
};

/**
 * Sync products from API response to the database.
 * Returns a map of item_id to auto-generated product ID for foreign key references.
 */
const syncProducts = async (
  db: ExpoSQLiteDatabase,
  itemGroups: ApiItemGroup[],
): Promise<Map<string, number>> => {
  const productIdMap = new Map<string, number>();

  for (const group of itemGroups) {
    for (const item of group.items) {
      const productData = {
        itemId: item.item_id,
        name: item.item_name,
        localizedEnglishName: item.item_name_english || null,
        itemCode: item.item_code,
        price: item.uom[0]?.price ?? 0,
        taxPercentage: item.tax_percentage,
        isDisabled: item.disabled === 1,
        categoryId: group.item_group_id,
      };

      // Check if product exists
      const existing = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.itemId, item.item_id))
        .limit(1);

      if (existing.length > 0) {
        // Update existing product
        await db.update(products).set(productData).where(eq(products.id, existing[0].id));
        productIdMap.set(item.item_id, existing[0].id);
      } else {
        // Insert new product
        const result = await db.insert(products).values(productData).returning({ id: products.id });
        if (result[0]) {
          productIdMap.set(item.item_id, result[0].id);
        }
      }
    }
  }

  return productIdMap;
};

/**
 * Sync barcodes from API response to the database.
 */
const syncBarcodes = async (
  db: ExpoSQLiteDatabase,
  itemGroups: ApiItemGroup[],
  productIdMap: Map<string, number>,
): Promise<void> => {
  // First, delete existing barcodes for products we're syncing
  const productIds = Array.from(productIdMap.values());
  for (const productId of productIds) {
    await db.delete(barcodes).where(eq(barcodes.productId, productId));
  }

  // Insert new barcodes
  for (const group of itemGroups) {
    for (const item of group.items) {
      const productId = productIdMap.get(item.item_id);
      if (!productId || !item.barcodes?.length) continue;

      const barcodeData = item.barcodes.map((bc) => ({
        id: bc.id,
        barCode: bc.barcode,
        uom: bc.uom,
        productId: productId,
      }));

      await db.insert(barcodes).values(barcodeData).onConflictDoNothing();
    }
  }
};

/**
 * Sync unit of measures from API response to the database.
 */
const syncUnitOfMeasures = async (
  db: ExpoSQLiteDatabase,
  itemGroups: ApiItemGroup[],
  productIdMap: Map<string, number>,
): Promise<void> => {
  // First, delete existing UOMs for products we're syncing
  const productIds = Array.from(productIdMap.values());
  for (const productId of productIds) {
    await db.delete(unitOfMeasures).where(eq(unitOfMeasures.productId, productId));
  }

  // Insert new UOMs
  for (const group of itemGroups) {
    for (const item of group.items) {
      const productId = productIdMap.get(item.item_id);
      if (!productId || !item.uom?.length) continue;

      const uomData = item.uom.map((u) => ({
        id: u.id,
        uom: u.uom,
        conversionFactor: u.conversion_factor,
        amount: u.price,
        isPriceEditable: u.editable_price,
        isQuantityEditable: u.editable_quantity,
        lastUpdated: new Date(),
        productId: productId,
      }));

      await db.insert(unitOfMeasures).values(uomData).onConflictDoNothing();
    }
  }
};

/**
 * Sync all product data from API to local database.
 * Fetches from API and stores categories, products, barcodes, and unit of measures.
 */
export const syncAllProducts = async (db: ExpoSQLiteDatabase): Promise<void> => {
  try {
    if (__DEV__) {
      console.log('[ProductsRepository] Starting product sync...');
    }

    const response: GetItemsResponse = await fetchProducts();

    if (!response?.data || response.data.length === 0) {
      if (__DEV__) {
        console.log('[ProductsRepository] No products to sync');
      }
      return;
    }

    // Sync in order: Categories first, then Products, then Barcodes and UOMs
    await syncCategories(db, response.data);
    const productIdMap = await syncProducts(db, response.data);
    await syncBarcodes(db, response.data, productIdMap);
    await syncUnitOfMeasures(db, response.data, productIdMap);

    if (__DEV__) {
      console.log(`[ProductsRepository] Synced ${productIdMap.size} products successfully`);
    }
  } catch (error) {
    console.error('[ProductsRepository] Product sync failed:', error);
    throw error;
  }
};

/**
 * Get all products from the local database, joined with their UOM data.
 * Returns one row per product-UOM combination (flat, no grouping).
 * A product with 3 UOMs will produce 3 rows.
 * Uses INNER JOIN since every product has at least one UOM.
 */
export const getProductsWithUom = async (db: ExpoSQLiteDatabase): Promise<ProductWithUom[]> => {
  return db
    .select({
      // Product columns
      id: products.id,
      itemId: products.itemId,
      name: products.name,
      localizedEnglishName: products.localizedEnglishName,
      itemCode: products.itemCode,
      price: products.price,
      taxPercentage: products.taxPercentage,
      isDisabled: products.isDisabled,
      categoryId: products.categoryId,
      // UOM columns
      uomId: unitOfMeasures.id,
      uom: unitOfMeasures.uom,
      conversionFactor: unitOfMeasures.conversionFactor,
      uomPrice: unitOfMeasures.amount,
      isPriceEditable: unitOfMeasures.isPriceEditable,
      isQuantityEditable: unitOfMeasures.isQuantityEditable,
    })
    .from(products)
    .innerJoin(unitOfMeasures, eq(products.id, unitOfMeasures.productId));
};

/**
 * Get all products from the local database (flat, no joins).
 */
export const getAllProducts = async (db: ExpoSQLiteDatabase) => {
  return db.select().from(products);
};

/**
 * Get all barcodes from the local database.
 */
export const getAllBarcodes = async (db: ExpoSQLiteDatabase) => {
  return db.select().from(barcodes);
};

/**
 * Get all categories from the local database.
 */
export const getAllCategories = async (db: ExpoSQLiteDatabase) => {
  return db.select().from(categories);
};

/**
 * Get products by category ID.
 */
export const getProductsByCategory = async (db: ExpoSQLiteDatabase, categoryId: string) => {
  return db.select().from(products).where(eq(products.categoryId, categoryId));
};

/**
 * Get barcodes for a product.
 */
export const getProductBarcodes = async (db: ExpoSQLiteDatabase, productId: number) => {
  return db.select().from(barcodes).where(eq(barcodes.productId, productId));
};

/**
 * Get unit of measures for a product.
 */
export const getProductUnitOfMeasures = async (db: ExpoSQLiteDatabase, productId: number) => {
  return db.select().from(unitOfMeasures).where(eq(unitOfMeasures.productId, productId));
};

/**
 * Clear all product-related data from the database.
 */
export const clearAllProductData = async (db: ExpoSQLiteDatabase): Promise<void> => {
  // Delete in reverse order of dependencies
  await db.delete(unitOfMeasures);
  await db.delete(barcodes);
  await db.delete(products);
  await db.delete(categories);
};
