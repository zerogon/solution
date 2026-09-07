/**
 * 운영 DB에 관리자 계정을 하나 만든다(또는 비밀번호를 재설정한다).
 *
 *   ADMIN_PASSWORD='...' npx tsx scripts/create-admin.ts --yes
 *   DATABASE_URL="$(...)" npx tsx scripts/create-admin.ts --yes   # 대상 명시
 *
 * `prisma/seed.ts`는 **모든 표를 지우고 다시 만드는** 로컬 전용 스크립트라 운영에는
 * 절대 못 쓴다(`assert-local-db` 가드). 반면 이 스크립트는 지우는 것이 없고 계정 하나만
 * upsert 한다 — 배포 직후 첫 로그인 수단을 만드는 유일한 경로다.
 *
 * ⚠️ `scripts/load-env.ts`는 `.env.local`(로컬 Postgres)을 `.env`(Neon)보다 **먼저** 읽는다.
 * 그래서 이 스크립트는 대상 호스트를 항상 찍어 보여 주고, 로컬이 아니면 `--yes` 없이는
 * 진행하지 않는다. 운영을 노렸는데 로컬을 고치는 사고를 막기 위한 것이다.
 */
import { randomBytes } from "node:crypto";

import "./load-env";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

import { PrismaClient } from "../src/generated/prisma/client.js";
import { EmployeeStatus, Role } from "../src/generated/prisma/enums.js";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const url = process.env.ADMIN_DB_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) {
  console.error("[create-admin] DATABASE_URL/DIRECT_URL이 없습니다.");
  process.exit(1);
}

let host: string;
let database: string;
try {
  const parsed = new URL(url);
  host = parsed.hostname;
  database = parsed.pathname.replace(/^\//, "");
} catch {
  console.error("[create-admin] 접속 문자열을 파싱할 수 없습니다.");
  process.exit(1);
}

const confirmed = process.argv.includes("--yes");
console.log(`[create-admin] 대상: ${database} @ ${host}`);
if (!LOCAL_HOSTS.has(host) && !confirmed) {
  console.error("[create-admin] 중단: 로컬이 아닌 DB입니다. 위 대상이 맞다면 --yes 를 붙여 다시 실행하세요.");
  process.exit(1);
}

const loginId = (process.env.ADMIN_LOGIN_ID ?? "admin").trim().toLowerCase();
const name = process.env.ADMIN_NAME ?? "관리자";
/** 비밀번호를 주지 않으면 임시 비밀번호를 만들고, 첫 로그인에서 변경을 강제한다. */
const provided = process.env.ADMIN_PASSWORD;
const password = provided ?? randomBytes(9).toString("base64url");

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function main() {
  const hash = await bcrypt.hash(password, 10);
  const existing = await prisma.user.findUnique({ where: { loginId } });

  await prisma.user.upsert({
    where: { loginId },
    // 이미 있으면 비밀번호 재설정 + 권한/상태만 보정한다. 이름·소속은 건드리지 않는다.
    update: {
      password: hash,
      mustChangePassword: !provided,
      role: Role.ADMIN,
      status: EmployeeStatus.ACTIVE,
    },
    create: {
      loginId,
      password: hash,
      mustChangePassword: !provided,
      name,
      role: Role.ADMIN,
      status: EmployeeStatus.ACTIVE,
    },
  });

  console.log(`[create-admin] ${existing ? "기존 계정 비밀번호를 재설정했습니다" : "새 관리자 계정을 만들었습니다"}.`);
  console.log(`  아이디   ${loginId}`);
  console.log(`  비밀번호 ${password}${provided ? "" : "  ← 임시. 첫 로그인에서 변경을 강제합니다."}`);
  if (!provided) console.log("  (이 값은 다시 볼 수 없습니다. 지금 옮겨 적으세요.)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
