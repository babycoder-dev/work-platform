import { defineConfig } from 'drizzle-kit';
import process from 'node:process';

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://work:work@localhost:5432/work_platform',
  },
  dialect: 'postgresql',
  out: './apps/platform-api/src/db/migrations',
  schema: './apps/platform-api/src/db/schema/platform.schema.ts',
});
