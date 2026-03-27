import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from './schema';

// Turso 클라이언트 초기화
// 로컬: TURSO_DATABASE_URL=file:data/unirate.db
// 프로덕션: TURSO_DATABASE_URL=libsql://your-db.turso.io
const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });

export type Db = typeof db;
