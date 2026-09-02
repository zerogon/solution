import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ResortSlug } from "../src/generated/prisma/enums";

/**
 * 수동 1박 단가를 넣거나 지운다 — 조회 화면 다이얼로그의 CLI 판.
 *
 * `scripts/set-exclusion.ts`와 같은 계보이고 존재 이유도 같다: **코드 쪽 절반이 조용히
 * 어긋날 수 있는 값은 그 절반을 되읽어주는 명령을 가져야 한다.** 여기서는 어긋날 수
 * 있는 것이 **둘**이라 제외보다 더 필요하다 — `branchName`과 `roomType`. 어느 쪽이
 * 틀려도 에러가 아니라 **무동작**이고, 증상은 "요금을 넣었는데 조회 화면이 빈칸"이다.
 * 그래서 매번 `catalog match`(지점)와 `inventory match`(객실유형)를 함께 찍는다.
 *
 *   npx tsx scripts/set-room-rate.ts SONO "소노벨 비발디파크 A" "리버 스위트" 170000 "2026 요금표 주중"
 *   npx tsx scripts/set-room-rate.ts SONO "소노벨 비발디파크 A" "리버 스위트" --delete
 *   npx tsx scripts/set-room-rate.ts SONO                    # 그 리조트의 요금 전부 나열
 *
 * ⚠️ **`roomType`은 대조로 막지 않는다.** 카탈로그가 없는 축이고(사이트가 정한다),
 * 이름이 바뀐 뒤 남은 고아 요금을 지우는 것이 정당한 사용이라 생성을 거부하면 그 정리가
 * 불가능해진다 — `set-exclusion.ts`가 카탈로그 대조를 **보고만** 하는 것과 같은 판단이다.
 * 대신 `inventory match: no`가 눈에 띄게 찍힌다.
 *
 * 관리 화면과 달리 감사 로그를 쓰지 않는다(요청 경로가 아니라 운영자 콘솔이다).
 *
 * 지점 목록은 `lib/resort-catalog.ts`가 아니라 **크롤러 config에서 직접** 읽는다 —
 * 그 모듈은 `server-only`라 tsx에서 던진다. 사본을 두지 않는 이유는 `set-exclusion.ts`
 * 헤더에 있다(사본이 어긋나면 이 스크립트가 틀린 `catalog match`를 자신 있게 찍는다).
 */
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/** 그 리조트의 지점 이름 전부 — 크롤러 config가 유일 출처다. */
async function loadBranchValues(slug: ResortSlug): Promise<string[]> {
  const mod: Record<string, unknown> = await import(
    `../src/crawlers/${slug.toLowerCase()}/config`
  );
  const config = mod[slug] as { branches?: ReadonlyArray<{ value: string }> } | undefined;
  if (!config?.branches) {
    throw new Error(
      `src/crawlers/${slug.toLowerCase()}/config.ts 가 ${slug}.branches 를 export하지 않는다`,
    );
  }
  return config.branches.map((b) => b.value);
}

const krw = (n: number) => `${n.toLocaleString("ko-KR")}원`;

async function main() {
  const slugArg = (process.argv[2] ?? "").toUpperCase();
  if (!(slugArg in ResortSlug)) {
    throw new Error(
      `slug가 필요하다. 유효 값: ${Object.keys(ResortSlug).join(", ")}\n` +
        `  npx tsx scripts/set-room-rate.ts SONO "지점" "객실유형" 170000 ["근거"]\n` +
        `  npx tsx scripts/set-room-rate.ts SONO "지점" "객실유형" --delete\n` +
        `  npx tsx scripts/set-room-rate.ts SONO`,
    );
  }
  const slug = slugArg as ResortSlug;

  const resort = await prisma.resort.findUnique({
    where: { slug },
    select: { id: true, name: true, active: true },
  });
  if (!resort) throw new Error(`${slug} 리조트 행이 DB에 없다 (npm run db:seed)`);

  const branchName = process.argv[3];
  const roomType = process.argv[4];

  // 인자가 없으면 나열만 한다. "지금 뭐가 들어 있나"가 이 스크립트의 가장 흔한 용도다.
  if (!branchName || !roomType) {
    const rows = await prisma.resortRoomRate.findMany({
      where: { resortId: resort.id },
      orderBy: [{ branchName: "asc" }, { roomType: "asc" }],
    });
    console.log(`${resort.name} (${slug}) — 수동 요금 ${rows.length}건`);
    for (const r of rows) {
      console.log(
        `  ${r.branchName} · ${r.roomType} — 1박 ${krw(r.perNight)}` +
          (r.note ? ` · ${r.note}` : ""),
      );
    }
    return;
  }

  const fourth = process.argv[5];
  const remove = fourth === "--delete";

  // 조인 키 둘을 매번 되읽어 준다. 이 두 줄이 이 스크립트의 존재 이유다.
  const branches = await loadBranchValues(slug);
  const invCount = await prisma.resortInventory.count({
    where: { resortId: resort.id, branchName, roomType },
  });
  const branchRows = await prisma.resortInventory.count({
    where: { resortId: resort.id, branchName },
  });
  console.log(`resort: ${resort.name}${resort.active ? "" : " (inactive)"}`);
  console.log(`catalog match: ${branches.includes(branchName) ? "yes" : "no"}  (${branchName})`);
  console.log(
    `inventory match: ${invCount > 0 ? `yes (${invCount}행)` : "no"}` +
      `  (${roomType}, 이 지점 재고 ${branchRows}행)`,
  );
  if (invCount === 0 && branchRows > 0) {
    console.log("  ⚠️  이 지점의 재고는 있는데 이 객실유형만 없다 — 이름이 어긋났을 수 있다.");
  }

  const key = {
    resortId_branchName_roomType: { resortId: resort.id, branchName, roomType },
  };

  if (remove) {
    const { count } = await prisma.resortRoomRate.deleteMany({
      where: { resortId: resort.id, branchName, roomType },
    });
    console.log(count === 0 ? "삭제할 요금이 없다" : "요금 삭제됨");
    return;
  }

  const perNight = Number((fourth ?? "").replace(/[,\s]/g, ""));
  if (!Number.isInteger(perNight) || perNight < 1 || perNight > 10_000_000) {
    throw new Error(
      `1박 단가는 1 이상 10,000,000 이하의 정수여야 한다 (받은 값: ${fourth ?? "(없음)"}).` +
        " 숙박 총액이 아니라 하룻밤 값이다.",
    );
  }
  const note = process.argv[6] ?? null;

  const before = await prisma.resortRoomRate.findUnique({
    where: key,
    select: { perNight: true },
  });
  await prisma.resortRoomRate.upsert({
    where: key,
    create: { resortId: resort.id, branchName, roomType, perNight, note },
    update: { perNight, note },
  });
  console.log(
    before
      ? `요금 수정: ${krw(before.perNight)} → ${krw(perNight)} (1박)`
      : `요금 생성: 1박 ${krw(perNight)}`,
  );
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
