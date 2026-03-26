import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import path from 'path';
import * as schema from './schema';

// SQLite DB 파일 경로 (프로젝트 루트의 data 디렉토리)
const DB_PATH = path.join(process.cwd(), 'data', 'unirate.db');

// SQLite 연결 및 Drizzle ORM 초기화
const sqlite = new Database(DB_PATH);

// WAL 모드 활성화 (동시성 향상)
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });

export type Db = typeof db;
