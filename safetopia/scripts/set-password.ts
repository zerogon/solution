/**
 * 앱 주인 계정(Owner 1행)을 만들거나 비밀번호를 재설정한다.
 *
 *   OWNER_PASSWORD='...' OWNER_NAME='홍길동' npm run owner:set-password -- --yes
 *
 * `prisma/seed.ts`는 **모든 표를 지우고 다시 만드는** 로컬 전용 스크립트라 운영에는
 * 절대 못 쓴다(`assert-local-db` 가드). 반면 이 스크립트는 지우는 것이 없고 Owner 한 행만
 * upsert 한다 — 배포 직후 첫 로그인 수단을 만드는 유일한 경로이자, 비밀번호를 잊었을 때의 복구 경로다.
 *
 * ⚠️ `scripts/load-env.ts`는 `.env.local`(로컬 Postgres)을 `.env`(Neon)보다 **먼저** 읽는다.
 * 그래서 이 스크립트는 대상 호스트를 항상 찍어 보여 주고, 로컬이 아니면 `--yes` 없이는
 * 진행하지 않는다. 운영을 노렸는데 로컬을 고치는 사고를 막기 위한 것이다.
 */
import "./load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const url = process.env.OWNER_DB_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("[set-password] DATABASE_URL/DIRECT_URL이 없습니다.");
  process.exit(1);
}

let host: string;
let database: string;
try {
  const parsed = new URL(url);
  host = parsed.hostname;
  database = parsed.pathname.replace(/^\//, "");
} catch {
  console.error("[set-password] 접속 문자열을 파싱할 수 없습니다.");
  process.exit(1);
}

const confirmed = process.argv.includes("--yes");
console.log(`[set-password] 대상: ${database} @ ${host}`);
if (!LOCAL_HOSTS.has(host) && !confirmed) {
  console.error("[set-password] 중단: 로컬이 아닌 DB입니다. 위 대상이 맞다면 --yes 를 붙여 다시 실행하세요.");
  process.exit(1);
}

const password = process.env.OWNER_PASSWORD;
if (!password || password.length < 4) {
  console.error("[set-password] OWNER_PASSWORD(4자 이상)를 환경변수로 주세요.");
  process.exit(1);
}
const name = process.env.OWNER_NAME;

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash(password!, 10);
  const existing = await prisma.owner.findUnique({ where: { id: "owner" } });
  await prisma.owner.upsert({
    where: { id: "owner" },
    // 이미 있으면 비밀번호만(그리고 이름을 줬다면 이름도) 바꾼다. 쉬는 요일·기록은 건드리지 않는다.
    update: { password: hash, ...(name ? { name } : {}) },
    create: { password: hash, name: name ?? "나" },
  });
  console.log(`[set-password] ${existing ? "비밀번호를 재설정했습니다" : "계정을 만들었습니다"}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
