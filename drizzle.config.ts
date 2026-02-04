import type { Config } from 'drizzle-kit';

export default {
  schema: './src/infrastructure/db/schema.ts',
  out: './src/infrastructure/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config;
