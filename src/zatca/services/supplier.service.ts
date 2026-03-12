// import { users } from '@/src/infrastructure/db/schema';
// import { drizzle } from 'drizzle-orm/expo-sqlite';
// import { openDatabaseSync } from 'expo-sqlite';

// const expoDb = openDatabaseSync('van_pos.db');
// const db = drizzle(expoDb);

// export async function getSupplierInfo() {
//   const result = await db.select().from(users).limit(1);

//   const user = result[0];

//   if (!user) {
//     throw new Error('Supplier not configured in database');
//   }

//   return {
//     registrationName: user.shopName ?? zatcaConfig.zatca.company_name ?? 'POS Store',

//     vatNumber: certificate.zatca.tax_id,
//   };
// }
