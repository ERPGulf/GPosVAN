import { fetchPromotions } from '@/src/features/promotions/services/promotionApi.service';
import {
  ApiPromotion,
  GetPromotionsResponse,
} from '@/src/features/promotions/types/promotionApi.types';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { promotionItems, promotions } from './schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a date string like "2026-04-01" into a Date object.
 */
const parseDate = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

// ─── Upsert ──────────────────────────────────────────────────────────────────

/**
 * Upsert a single promotion and its items into the local database.
 * - Inserts or updates the promotion header.
 * - Deletes existing items for this promotion, then inserts fresh ones.
 */
const upsertPromotion = async (
  db: ExpoSQLiteDatabase,
  promo: ApiPromotion,
): Promise<void> => {
  // Upsert promotion header
  const existing = await db
    .select({ promotionId: promotions.promotionId })
    .from(promotions)
    .where(eq(promotions.promotionId, promo.id))
    .limit(1);

  const promoData = {
    promotionId: promo.id,
    disabled: promo.disabled === 1,
    validFrom: parseDate(promo.valid_from),
    validUpto: parseDate(promo.valid_upto),
  };

  if (existing.length > 0) {
    await db
      .update(promotions)
      .set(promoData)
      .where(eq(promotions.promotionId, promo.id));
  } else {
    await db.insert(promotions).values(promoData);
  }

  // Delete existing items for this promotion, then re-insert
  await db
    .delete(promotionItems)
    .where(eq(promotionItems.promotionId, promo.id));

  if (promo.items && promo.items.length > 0) {
    const itemsData = promo.items.map((item) => ({
      id: item.id,
      itemCode: item.item_code,
      itemName: item.item_name,
      discountType: item.discount_type,
      minQty: item.min_qty,
      maxQty: item.max_qty,
      discountPercentage: item.discount_percentage,
      discountPrice: item.discount_price,
      rate: item.sale_price,
      uomId: item.uom_id,
      uom: item.uom,
      createOn: new Date(),
      updatedOn: new Date(),
      promotionId: promo.id,
    }));

    for (const itemData of itemsData) {
      await db.insert(promotionItems).values(itemData);
    }
  }
};

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Sync all promotions from the API to the local database.
 * - Fetches promotions from the server.
 * - Upserts each promotion and its items.
 * - Deletes any local promotions no longer returned by the server.
 */
export const syncAllPromotions = async (
  db: ExpoSQLiteDatabase,
  posProfile: string,
): Promise<void> => {
  try {
    if (__DEV__) {
      console.log('[PromotionsRepository] Starting promotion sync...');
    }

    const response: GetPromotionsResponse = await fetchPromotions(posProfile);

    if (!response?.data) {
      if (__DEV__) {
        console.log('[PromotionsRepository] No promotions data received');
      }
      return;
    }

    const serverPromoIds = response.data.map((p) => p.id);

    // Upsert each promotion from the server
    for (const promo of response.data) {
      await upsertPromotion(db, promo);
    }

    // Delete local promotions that are no longer on the server
    if (serverPromoIds.length > 0) {
      // Delete orphaned promotion items first
      await db
        .delete(promotionItems)
        .where(notInArray(promotionItems.promotionId, serverPromoIds));

      // Then delete orphaned promotions
      await db
        .delete(promotions)
        .where(notInArray(promotions.promotionId, serverPromoIds));
    } else {
      // Server returned empty list — clear all local promotions
      await db.delete(promotionItems);
      await db.delete(promotions);
    }

    if (__DEV__) {
      console.log(
        `[PromotionsRepository] Synced ${response.data.length} promotion(s) successfully`,
      );
    }
  } catch (error) {
    console.error('[PromotionsRepository] Promotion sync failed:', error);
    throw error;
  }
};

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Get a valid promotion item for the given item code, quantity, and UOM.
 * A promotion is valid when:
 * - It is not disabled
 * - Today falls between ValidFrom and ValidUpto
 * - The cart quantity meets the MinQty threshold
 * - ItemCode and UOM match
 */
export const getValidPromotion = async (
  db: ExpoSQLiteDatabase,
  itemCode: string,
  quantity: number,
  uom: string,
) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get all non-disabled promotions that are currently valid
  const validPromos = await db
    .select()
    .from(promotions)
    .where(
      and(
        eq(promotions.disabled, false),
      ),
    );

  // Filter by date range in JS (since we store timestamps)
  const activePromoIds = validPromos
    .filter((p) => {
      const from = new Date(p.validFrom);
      from.setHours(0, 0, 0, 0);
      const upto = new Date(p.validUpto);
      upto.setHours(23, 59, 59, 999);
      return today >= from && today <= upto;
    })
    .map((p) => p.promotionId);

  if (activePromoIds.length === 0) return null;

  // Find matching promotion items
  const matchingItems = await db
    .select()
    .from(promotionItems)
    .where(
      and(
        inArray(promotionItems.promotionId, activePromoIds),
        eq(promotionItems.itemCode, itemCode),
      ),
    );

  // Filter by UOM and MinQty
  const match = matchingItems.find((item) => {
    const uomMatch =
      !item.uom || item.uom === '' || item.uom === uom;
    return uomMatch && quantity >= (item.minQty ?? 0);
  });

  return match ?? null;
};

/**
 * Get all promotions from the local database.
 */
export const getAllPromotions = async (db: ExpoSQLiteDatabase) => {
  return db.select().from(promotions);
};

/**
 * Get all promotion items from the local database.
 */
export const getAllPromotionItems = async (db: ExpoSQLiteDatabase) => {
  return db.select().from(promotionItems);
};

/**
 * Clear all promotion data from the local database.
 */
export const clearAllPromotionData = async (db: ExpoSQLiteDatabase): Promise<void> => {
  await db.delete(promotionItems);
  await db.delete(promotions);
};
