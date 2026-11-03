import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";
import ws from "ws";

import * as schema from "./schema";

let _db: NeonDatabase<typeof schema> | null = null;

/**
 * 드라이버는 `@neondatabase/serverless`의 WebSocket Pool 하나다 (drizzle `neon-serverless`).
 * HTTP(neon-http) 대신 WebSocket을 쓰는 이유: 로컬 개발용 wsproxy(docker-compose)가
 * WebSocket만 중계하고, 프로덕션 Neon은 둘 다 되므로 공통분모를 택했다.
 *
 * 로컬: `NEON_LOCAL_PROXY`(예: `db.localtest.me:4444`)가 있으면 그 프록시로 보낸다.
 */
function configureDriver() {
  neonConfig.webSocketConstructor = ws;
  const proxy = process.env.NEON_LOCAL_PROXY;
  if (!proxy) return;
  neonConfig.useSecureWebSocket = false;
  neonConfig.wsProxy = () => `${proxy}/v1`;
  neonConfig.pipelineConnect = false;
}

/**
 * 첫 호출에서 연결을 만든다. 모듈 로드 시점에 만들면 DATABASE_URL이 없는
 * 빌드 단계(정적 분석)에서 던지므로 lazy로 둔다.
 */
export function getDb() {
  if (!_db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL 환경변수가 없습니다.");
    configureDriver();
    _db = drizzle(new Pool({ connectionString: url }), { schema });
  }
  return _db;
}

export { schema };
