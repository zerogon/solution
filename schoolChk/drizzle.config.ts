import { defineConfig } from 'drizzle-kit';
import path from 'path';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: path.join(process.cwd(), 'data', 'unirate.db'),
  },
  verbose: true,
  strict: true,
});
