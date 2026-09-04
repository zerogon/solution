import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, ResortSlug } from "../src/generated/prisma/client";

const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const ADMIN = {
  loginId: "admin",
  password: "0000",
  email: "admin@local",
  name: "관리자",
};

const ALLOWED_EMAILS = [
  { email: "ygsong2@skshieldus.com", note: "초기 관리자 (Google OAuth 재활성화 시 사용)" },
];

const RESORTS: Array<{
  slug: ResortSlug;
  name: string;
  region: string;
  baseUrl: string;
  loginUrl: string;
  active: boolean;
  memo?: string;
}> = [
  {
    slug: ResortSlug.LOTTE,
    name: "롯데리조트",
    region: "전국",
    // lotteresort.com은 2026-07 lottehotel.com으로 통합됨
    baseUrl: "https://www.lottehotel.com",
    loginUrl: "https://www.lottehotel.com/global/ko/login/rewards",
    active: false,
    memo: "MVP 우선 대상. 실사이트 검증 통과 후 active=true",
  },
  {
    slug: ResortSlug.RESOM,
    name: "리솜리조트",
    region: "전국",
    baseUrl: "https://www.resom.co.kr",
    loginUrl: "https://www.resom.co.kr/login",
    active: false,
  },
  {
    slug: ResortSlug.HANWHA,
    name: "한화리조트",
    region: "전국",
    baseUrl: "https://www.hanwharesort.co.kr",
    // /login is the site's error page. Nothing reads this column at runtime
    // (hanwha/config.ts is authoritative), but it is read as documentation.
    loginUrl: "https://www.hanwharesort.co.kr/irsweb/resort3/member/login.do",
    active: false,
    memo: "로그인 2단계 — ID/PW 뒤에 회원인증(회원권 비밀번호) 화면. 그 값은 계정 메모에 있다",
  },
  {
    slug: ResortSlug.OAKVALLEY,
    name: "오크밸리",
    region: "전국",
    baseUrl: "https://oakvalley.co.kr",
    // /login does not exist in the SPA's router — the real route is
    // /account/login. Nothing reads this column at runtime (each crawler's own
    // config.loginUrl is authoritative), but it is read as documentation.
    loginUrl: "https://oakvalley.co.kr/account/login",
    active: false,
  },
  {
    slug: ResortSlug.SONO,
    name: "소노호텔앤리조트",
    region: "전국",
    baseUrl: "https://www.sonohotelsresorts.com",
    loginUrl: "https://www.sonohotelsresorts.com/member/login",
    active: false,
    memo: "구 대명리조트 (소노로 리브랜딩). 회원(제휴) 예약 경로 — 비로그인 조회 불가",
  },
];

async function main() {
  console.log("Seeding admin user…");
  const passwordHash = await bcrypt.hash(ADMIN.password, 10);
  await prisma.user.upsert({
    where: { loginId: ADMIN.loginId },
    create: {
      loginId: ADMIN.loginId,
      password: passwordHash,
      email: ADMIN.email,
      name: ADMIN.name,
    },
    update: {
      password: passwordHash,
      email: ADMIN.email,
      name: ADMIN.name,
    },
  });

  console.log("Seeding allowed emails…");
  for (const item of ALLOWED_EMAILS) {
    await prisma.allowedEmail.upsert({
      where: { email: item.email },
      create: item,
      update: { note: item.note },
    });
  }

  console.log("Seeding resorts…");
  for (const r of RESORTS) {
    await prisma.resort.upsert({
      where: { slug: r.slug },
      create: r,
      update: {
        name: r.name,
        region: r.region,
        baseUrl: r.baseUrl,
        loginUrl: r.loginUrl,
        memo: r.memo,
      },
    });
  }

  console.log("Seed complete. Login: admin / 0000");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
