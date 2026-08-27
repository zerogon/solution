import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import {
  SCHEDULED_CRAWL_PAUSE_REASON,
  SCHEDULED_CRAWL_PAUSED,
} from "@/lib/inngest/pause";
import { listCrawlableResorts } from "@/lib/inngest/targets";
import { buildHotWindows } from "@/lib/inngest/windows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Once-a-day backstop for the Inngest scheduler (`scheduled-refresh`), wired in
 * vercel.json. Inngest only fires crons for an app it has successfully synced,
 * so a failed sync would silently stop all collection; this path re-dispatches
 * the same events straight from Vercel's own scheduler.
 *
 * Inngest가 09:00 KST에 돌고 이 백스톱은 12:00 KST에 돈다. 정기 수집이 하루 1회로
 * 바뀌었으므로(운영자 결정, 2026-08-24) 백스톱이 무조건 팬아웃하면 그 결정이 무효가
 * 된다 — 그래서 **이미 신선한 리조트는 건너뛴다**. 즉 평상시 이 경로는 아무것도
 * 하지 않고, 09:00이 실제로 못 끝낸 날에만 일을 한다.
 *
 * **신선함의 기준은 `crawl_logs`가 아니라 `resort_inventory`다.** SUCCESS 유무로
 * 판정하던 시절에는 미완주 수집이 완주로 셌고, 2026-08-27에 롯데와 한화가 정확히
 * 그렇게 빠졌다 — 둘 다 09:0x에 SUCCESS 행이 있었지만 09:05에 인스턴스가 죽어
 * 핫 윈도우 절반이 하루 넘게 낡은 채였다. 백스톱만이 그날 그것을 고칠 수 있었고,
 * 보고 있던 것이 틀린 테이블이라 그냥 지나갔다.
 *
 * 건너뛴 것을 응답에 실어 보내는 게 중요하다. 조용한 no-op은 "할 일이 없었다"와
 * "이 라우트도 같이 죽었다"를 구별해주지 않고, 이 프로젝트는 정확히 그 구별이
 * 안 되는 상태로 오래 고생했다 (CLAUDE.md "배포" 절).
 *
 * Bypasses session auth (`auth.config.ts` isPublic) and is therefore guarded by
 * `CRON_SECRET` instead: Vercel Cron sends it as `Authorization: Bearer …` when
 * the env var is set. Unset in an environment where this route is reachable
 * means anyone can trigger a crawl, so it's a hard requirement, not a fallback.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "cron_secret_unset" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Same switch as `scheduled-refresh`. Checked after the secret, not before:
  // an unauthenticated caller should learn nothing about our schedule, paused
  // or not.
  if (SCHEDULED_CRAWL_PAUSED) {
    return NextResponse.json({
      dispatched: 0,
      paused: true,
      reason: SCHEDULED_CRAWL_PAUSE_REASON,
    });
  }

  const slugs = await listCrawlableResorts();
  const coverage = await hotWindowCoverage();

  const wanted = buildHotWindows().length;
  const cutoffH = HOT_FRESH_MS / 3_600_000;

  const report = slugs.map((slug) => {
    const c = coverage.get(slug);
    const ageHours = c?.oldest ? (Date.now() - c.oldest.getTime()) / 3_600_000 : null;
    return {
      slug,
      windowsCovered: c?.covered ?? 0,
      windowsWanted: wanted,
      oldestAgeHours: ageHours === null ? null : Math.round(ageHours * 10) / 10,
      // 판정은 **나이**가 한다. 못 돈 윈도우에는 어제 행이 그대로 남아 있으므로
      // (`purge-past-inventory`는 지난 날짜만 지운다) 미완주가 `min`을 끌어내린다 —
      // 08-27의 롯데(384시간)와 한화(27시간)가 정확히 이 신호에 걸린다.
      //
      // **커버리지는 판정에 쓰지 않는다.** 실측이 그 이유다: 다섯 곳 전부 60/60을
      // 완주한 직후에도 롯데는 50/60이었다. 못 돈 것이 아니라 그 열 윈도우가 정말로
      // 네 지점 모두 만실이어서 0행이고(롯데는 만실을 빈 `roomList`로 준다), 그 상태는
      // 성수기에 며칠씩 이어진다. 커버리지를 게이트로 쓰면 그동안 백스톱이 **매일**
      // 헛수고를 하고, "평상시 이 경로는 아무것도 하지 않는다"가 무너진다.
      // 그래서 숫자는 응답에 싣되(보이면 조사할 수 있다) 판정에서는 뺀다.
      //
      // 남는 사각 하나: **한 번도 수집된 적 없는** 윈도우는 행이 없어 `min`에
      // 영향을 주지 않는다. 그건 30일 창의 맨 끝 하루뿐이고, 다음 날 그 윈도우가
      // 앞으로 당겨지면서 낡은 이웃과 함께 잡힌다. `covered === 0`(그 리조트가
      // 통째로 비었다)만은 나이로 볼 것이 없으므로 여기서 직접 막는다.
      //
      // 그리고 아는 대가 하나: **유령을 품은 리조트는 매일 한 번 더 수집된다.**
      // 0행으로 답한 그룹의 옛 행은 `removeVanishedRows`가 손댈 수 없어 남고
      // (`scheduled-refresh`의 유령 청소가 7일에 걸러내지만 그전까지는 살아 있다),
      // 그게 `min`을 계속 끌어내린다. 실측(2026-08-27): 다섯 곳 전부 60/60을
      // 완주한 직후에도 롯데의 `min`은 60.7시간이었다. 즉 이 값은 "수집이 안 됐다"가
      // 아니라 "확인되지 않은 채 남은 행이 있다"를 뜻할 수 있고, 그 경우 재수집은
      // 그것을 고치지 못한다.
      //
      // 그래도 이 방향을 고른다. 대가는 하루 한 번의 짧은 크롤이고 스스로 수렴한다.
      // 반대 방향의 대가는 08-27에 이미 치렀다 — 한화의 낡은 절반이 하루를 더 갔다.
      fresh: (c?.covered ?? 0) > 0 && ageHours !== null && ageHours <= cutoffH,
    };
  });

  const dispatch = report.filter((r) => !r.fresh).map((r) => r.slug);

  // 이 라우트에 "무슨 생각인지"를 물어볼 방법이 없으면 안 된다. Hobby는 런타임
  // 로그를 보관하지 않아 응답 본문이 유일한 창인데, 그냥 부르면 그 자체가
  // 팬아웃이라 **관측이 곧 개입**이 된다. `?dryRun=1`은 판단만 하고 보낸다.
  // 시크릿 검사 뒤에 있으므로 인증 없이는 이것도 못 부른다.
  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1";

  if (dispatch.length > 0 && !dryRun) {
    await inngest.send(
      dispatch.map((slug) => ({
        name: "resort/crawl.requested" as const,
        data: { slug, triggeredBy: "CRON_BACKSTOP" },
      })),
    );
  }

  return NextResponse.json({
    dispatched: dryRun ? 0 : dispatch.length,
    dryRun,
    slugs: dispatch,
    // 빈 배열이라도 항상 싣는다 — 이 필드의 존재 자체가 "라우트는 살아 있고 판단을
    // 내렸다"는 증거이고, 그게 이 백스톱이 답해야 할 질문이다.
    // 이제 판단의 **근거**까지 싣는다: 어느 리조트의 핫 윈도우가 몇 개 덮였고 그중
    // 가장 낡은 것이 몇 시간 됐는지. 09:00이 완주했다는 독립적인 증거가 여기다.
    resorts: report,
    hotFreshWithinHours: cutoffH,
  });
}

/**
 * 리조트별로 핫 윈도우가 **몇 개 덮였고** 그중 가장 낡은 행이 언제 것인지.
 *
 * 날짜 지식을 여기서 다시 만들지 않고 `buildHotWindows()`가 만든 쌍을 그대로
 * 질의에 넣는다. "오늘부터 30일 × 1~2박"을 SQL로 다시 쓰면 스케줄러가 실제로
 * 채우는 목록과 어긋날 수 있고, 어긋났을 때의 증상은 에러가 아니라 **매일 도는
 * 불필요한 재수집**이거나 **영영 안 도는 리조트**다.
 *
 * 행이 하나도 없는 리조트는 결과에 나타나지 않는다 — 호출부에서 covered 0으로
 * 읽혀 재수집 대상이 되고, 그게 옳다.
 */
async function hotWindowCoverage(): Promise<
  Map<string, { covered: number; oldest: Date | null }>
> {
  const windows = buildHotWindows();
  const ci = windows.map((w) => w.checkin);
  const co = windows.map((w) => w.checkout);

  const rows = await prisma.$queryRaw<
    Array<{ slug: string; covered: number; oldest: Date | null }>
  >`
    WITH want AS (
      SELECT unnest(${ci}::date[]) AS ci, unnest(${co}::date[]) AS co
    )
    SELECT r.slug::text AS slug,
           count(DISTINCT (i.checkin_date, i.checkout_date))::int AS covered,
           min(i.synced_at) AS oldest
      FROM resort_inventory i
      JOIN resorts r ON r.id = i.resort_id
      JOIN want w ON w.ci = i.checkin_date AND w.co = i.checkout_date
     GROUP BY r.slug
  `;

  return new Map(rows.map((r) => [r.slug, { covered: r.covered, oldest: r.oldest }]));
}

/**
 * 핫 윈도우가 이보다 낡았으면 백스톱이 다시 돌린다.
 *
 * 6시간을 고른 근거는 그대로다 — 09:00 실행이 재시도로 밀려도 12:00이 그것을
 * "없었던 일"로 읽지 않을 만큼 넓고, 어제 것을 오늘로 착각할 만큼 넓지는 않다.
 *
 * 바뀐 것은 **무엇의 나이를 재는가**다. 종전에는 `crawl_logs`에 SUCCESS가 하나라도
 * 있으면 건너뛰었는데, 그 판정은 미완주 수집을 완주로 셌다 — 2026-08-27에 롯데와
 * 한화가 정확히 그렇게 빠졌다. 둘 다 09:0x에 SUCCESS 행이 있었지만 한화는 핫
 * 윈도우 91개 중 44개가 하루 넘게 낡은 채였고, 백스톱은 그걸 보지 않았다.
 * 이제 조회 화면이 읽는 것과 같은 테이블을 본다.
 */
const HOT_FRESH_MS = 6 * 60 * 60 * 1000;
