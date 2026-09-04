import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { ResortSlug } from "../src/generated/prisma/enums";

/**
 * 지점 하나를 조회·수집에서 빼거나 되살린다 — `/admin/properties`의 CLI 판.
 *
 * `scripts/set-active.ts`와 같은 계보이고 존재 이유도 같다: **코드 쪽 절반이 조용히
 * 어긋날 수 있는 플래그는 그 절반을 되읽어주는 명령을 가져야 한다.** 여기서 어긋나는
 * 것은 `branchName`이다 — 카탈로그에 없는 이름은 에러가 아니라 **무동작**이고,
 * 증상은 "제외했는데 그 지점이 그대로 보인다"이다. 그래서 매번 `catalog match`를 찍는다.
 *
 * 관리 화면과 달리 감사 로그를 쓰지 않는다(`set-active.ts`와 같은 판단 — 요청 경로가
 * 아니라 운영자 콘솔이다). 대신 지운 재고 행 수를 표준출력에 남긴다.
 *
 *   npx tsx scripts/set-exclusion.ts HANWHA "산정호수" "제휴 없음"
 *   npx tsx scripts/set-exclusion.ts HANWHA "산정호수" --include
 *
 * 지점 목록은 `lib/resort-catalog.ts`가 아니라 **크롤러 config에서 직접** 읽는다. 그 모듈은
 * `server-only`라 tsx에서 던지고, 우회 조건(`--conditions=react-server`)은 Prisma가 다른
 * 런타임 빌드로 해석돼 DB가 붙지 않는다. 그렇다고 지점 목록의 사본을 여기 두면 그 사본이
 * 어긋났을 때 이 스크립트가 **틀린 `catalog match`를 자신 있게 찍게 되고**, 그건 이
 * 스크립트가 존재하는 이유 자체를 무너뜨린다. 그래서 사본이 아니라 **같은 배열**을 읽는다 —
 * 카탈로그가 읽는 것도 `config.branches`다.
 *
 * 경로는 규약으로 유도한다(`src/crawlers/<소문자 slug>/config.ts`의 `<대문자 slug>` export).
 * 새 리조트를 추가할 때 여기 고칠 것이 없고, 규약을 벗어나면 조용히 "no"가 아니라 던진다.
 */
const adapter = new PrismaPg({
  connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/**
 * 그 리조트의 지점 이름 전부 — 크롤러 config가 유일 출처다(`resort-catalog.ts`가 읽는
 * 것과 **같은 배열**이고, 그래서 사본 드리프트가 없다).
 *
 * 규약(`src/crawlers/<slug 소문자>/config.ts`가 `<slug 대문자>`를 export)에서 유도하므로
 * 새 리조트를 추가할 때 이 파일에 손댈 것이 없다. 규약을 벗어나면 던진다 —
 * "지점을 하나도 못 찾음"이 조용한 `catalog match: no`로 나가면 안 된다.
 */
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

async function main() {
  const slugArg = (process.argv[2] ?? "").toUpperCase();
  const branchName = process.argv[3] ?? "";
  const third = process.argv[4];

  if (!(slugArg in ResortSlug)) {
    throw new Error(
      `Unknown slug: "${slugArg}". One of ${Object.keys(ResortSlug).join(", ")}`,
    );
  }
  if (!branchName) {
    throw new Error(
      'Usage: set-exclusion.ts <SLUG> "<지점명>" [사유 | --include]',
    );
  }
  const slug = slugArg as ResortSlug;
  const include = third === "--include";
  const reason = include ? null : (third ?? null);

  const resort = await prisma.resort.findUnique({
    where: { slug },
    select: { id: true, name: true, active: true },
  });
  if (!resort) throw new Error(`Resort row missing for ${slug} — run npm run db:seed`);

  // 코드 쪽 절반. 강제하지 않고 보고만 한다 — 크롤러가 지점 이름을 바꾼 뒤 옛 이름의
  // 규칙을 지우려는 것이 정당한 사용이라, 대조 실패를 이유로 거부하면 그 정리가 막힌다.
  // (관리 화면의 `excludeProperty`는 반대로 **생성**만 거부한다.)
  const properties = await loadBranchValues(slug);
  const matched = properties.includes(branchName);
  console.log(
    `catalog match: ${matched ? "yes" : "no  ← 이 이름은 아무것도 걸러내지 않는다(무동작)"}`,
  );

  if (include) {
    const { count } = await prisma.resortBranchExclusion.deleteMany({
      where: { resortId: resort.id, branchName },
    });
    console.log(
      count > 0
        ? `included: ${slug} / ${branchName} — 다음 수집 전까지 재고는 비어 있다`
        : `nothing to do: ${slug} / ${branchName} 는 제외돼 있지 않았다`,
    );
  } else {
    const existing = await prisma.resortBranchExclusion.count({
      where: { resortId: resort.id, branchName },
    });
    if (existing > 0) {
      console.log(`already excluded: ${slug} / ${branchName}`);
    } else {
      const [, del] = await prisma.$transaction([
        prisma.resortBranchExclusion.create({
          data: { resortId: resort.id, branchName, reason },
        }),
        prisma.resortInventory.deleteMany({
          where: { resortId: resort.id, branchName },
        }),
      ]);
      console.log(`excluded: ${slug} / ${branchName}${reason ? ` (${reason})` : ""}`);
      console.log(`inventory rows deleted: ${del.count}`);
    }
  }

  const after = await prisma.resortBranchExclusion.findMany({
    where: { resortId: resort.id },
    select: { branchName: true },
    orderBy: { branchName: "asc" },
  });
  const excluded = new Set(after.map((x) => x.branchName));
  const live = properties.filter((v) => !excluded.has(v)).length;
  console.log(
    `${resort.name}: ${live}/${properties.length} 운영` +
      `${resort.active ? "" : " (Resort.active=false — 리조트 자체가 꺼져 있다)"}`,
  );
  if (after.length > 0) {
    console.log("excluded:", after.map((x) => x.branchName).join(", "));
  }
  if (live === 0 && properties.length > 0) {
    console.log(
      "⚠️  지점이 하나도 남지 않았다. 그 리조트는 매 핫 윈도우에서 0행이 되고,\n" +
        "    백스톱이 covered===0을 '낡음'으로 읽어 매일 헛수고한다.\n" +
        `    리조트 전체를 끄려면: npx tsx scripts/set-active.ts ${slug} false`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
