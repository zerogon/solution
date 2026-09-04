// 파괴적 DB 명령(migrate reset/deploy, seed 등) 전에 실행하는 안전 가드.
// 해석된 접속 대상 호스트가 로컬이 아니면 즉시 중단하여 운영 Neon DB 오염을 원천 차단한다.
import "./load-env";

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!url) {
  console.error("[assert-local-db] DATABASE_URL/DIRECT_URL이 설정되지 않았습니다. .env.local을 확인하세요.");
  process.exit(1);
}

let host: string;
try {
  host = new URL(url).hostname;
} catch {
  console.error("[assert-local-db] 접속 문자열을 파싱할 수 없습니다.");
  process.exit(1);
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

if (!LOCAL_HOSTS.has(host)) {
  console.error(
    `[assert-local-db] 중단: 대상 호스트가 로컬이 아닙니다 (host="${host}").\n` +
      "  이 명령은 로컬 개발 DB에서만 허용됩니다. 로컬 Postgres를 가리키는 .env.local이 있는지 확인하세요."
  );
  process.exit(1);
}

console.log(`[assert-local-db] OK — 로컬 DB(host="${host}") 확인됨.`);
