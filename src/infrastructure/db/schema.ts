import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const offlineUsers = sqliteTable('offline_users', {
  name: text('name').primaryKey(), // API returns 'name' as the unique identifier
  offlineUsername: text('offline_username'),
  shopName: text('shop_name'),
  password: text('password'),
  customCashierName: text('custom_cashier_name'),
  actualUserName: text('actual_user_name'),
  branchAddress: text('branch_address'),
  printTemplate: text('print_template'),
  customPrintFormat: text('custom_print_format'),
  customIsAdmin: integer('custom_is_admin', { mode: 'boolean' }),
  posProfiles: text('pos_profiles', { mode: 'json' }).$type<string[]>(),
});
