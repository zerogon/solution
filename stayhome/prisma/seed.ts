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
    baseUrl: "https://www.lotteresort.com",
    loginUrl: "https://www.lotteresort.com/login",
    active: false,
    memo: "MVP 우선 대상. 셀렉터 캡처 후 active=true",
  },
  {
    slug: ResortSlug.SONO,
    name: "소노호텔앤리조트",
    region: "전국",
    baseUrl: "https://www.sonohotelsresorts.com",
    loginUrl: "https://www.sonohotelsresorts.com/login",
    active: false,
  },
  {
    slug: ResortSlug.HANWHA,
    name: "한화리조트",
    region: "전국",
    baseUrl: "https://www.hanwharesort.co.kr",
    loginUrl: "https://www.hanwharesort.co.kr/login",
    active: false,
  },
  {
    slug: ResortSlug.DAEMYUNG,
    name: "대명리조트",
    region: "전국",
    baseUrl: "https://www.daemyungresort.com",
    loginUrl: "https://www.daemyungresort.com/login",
    active: false,
  },
  {
    slug: ResortSlug.KENSINGTON,
    name: "켄싱턴리조트",
    region: "전국",
    baseUrl: "https://www.kensingtonresort.co.kr",
    loginUrl: "https://www.kensingtonresort.co.kr/login",
    active: false,
  },
  {
    slug: ResortSlug.HYUNDAI,
    name: "현대블룸비스타",
    region: "전국",
    baseUrl: "https://www.bloomvista.co.kr",
    loginUrl: "https://www.bloomvista.co.kr/login",
    active: false,
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
