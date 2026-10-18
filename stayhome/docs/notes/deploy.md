> `CLAUDE.md`에서 옮긴 문서다(2026-10-01, 지침 파일 정리). 내용은 그대로이고,
> 다른 문서·코드 주석이 "`CLAUDE.md`의 "배포" 절"이라 부르는 곳이 여기다.
> 자동 로드되지 않는다 — 요약과 색인은 `CLAUDE.md`에 있다.

# 배포 (Vercel)

프로젝트는 `zerogons-projects/stayhome` (`stayhome-khaki.vercel.app`).

- **함수 리전은 `icn1`(서울)이다** — `vercel.json`의 `"regions": ["icn1"]`. 기본값
  `iad1`(워싱턴)에서는 **롯데와 한화가 로그인 자체를 못 한다**: 롯데는 Imperva Advanced Bot
  Protection이 로그인 페이지 대신 `Pardon Our Interruption`을 돌려주고(그래서
  `login_01_001`이 아예 안 나간다), 한화는 첫 `page.goto`에서 `net::ERR_CONNECTION_RESET`이다
  — 지문 검사가 개입할 여지도 없이 **연결이 거부된다**. 같은 배포에서 소노·리솜·오크밸리는
  성공하고 같은 코드가 로컬(한국 IP)에서는 5곳 전부 통과하므로, 원인은 코드가 아니라 **출구 IP**다.
  · **Hobby도 리전을 고를 수 있다.** 제약은 "리전 1개"이지 "리전 고정"이 아니고,
    `icn1`(서울, ap-northeast-2)은 일반 리전 목록에 있다. 2026-08-23 이전 이 문서는
    "Vercel은 한국 리전이 없다"고 적고 있었다 — 틀렸고, 그 오기 때문에 가장 싼 선택지가
    2주 동안 검토에서 빠져 있었다.
  · **대가는 DB 왕복이다.** Neon이 `us-east-1`이라 쿼리당 ~200ms가 붙는다(Neon은 서울·도쿄
    리전이 없고, 기존 프로젝트의 리전은 변경 불가). 반대로 리조트 사이트 호출은 전부
    한국이라 줄어든다 — 지점마다 콜을 내는 한화(16콜)는 크롤이 오히려 빨라진다.
  · 확인은 `npx vercel inspect stayhome-khaki.vercel.app`의 람다 목록이 `[icn1]`인지.
    `functions`별 리전 분리는 Hobby에서 **불가능**하다(리전이 2개가 되는 순간 빌드 전에 실패).
- **크롤 한 번이 `/tmp`를 다 쓰면 다음 크롤이 죽는다** — 2026-08-23 실측·수정.
  Vercel 함수의 `/tmp`는 525MB이고 브라우저가 거기 산다. 새 인스턴스는 513MB가 비어 있는데
  한화 크롤 한 번이 끝나면 **17MB**가 남고, 그 워밍 인스턴스에 붙는 다음 크롤은 전부
  죽는다 — Inngest 재시도까지 같은 인스턴스로 가서, 무거운 크롤 하나가 리조트 다섯 곳의
  실패로 번진다. 증상이 고약한 건 **에러가 사이트 탓처럼 보인다**는 것이다:
  `net::ERR_INSUFFICIENT_RESOURCES`, `Target page, context or browser has been closed`,
  그리고 콜드 인스턴스에서 두 호출이 동시에 추출을 건드리면 `spawn ETXTBSY`.
  2026-08-09·08-11·08-20의 미제 실패가 전부 이거였다.
  · **주범은 `@sparticuz/chromium-min`이 남기는 `/tmp/chromium-pack`이다.** 이 라이브러리는
    팩을 거기 풀고 `chromium.br`·`fonts.tar.br`·`swiftshader.tar.br`를 `/tmp`로 다시 압축
    해제한 뒤 **압축본을 지우지 않는다.** 그런데 자기 `executablePath()`는 `/tmp/chromium`이
    있으면 조기 반환하므로, 두 번째 실행부터 그 팩은 **아무도 다시 읽지 않는 브라우저의
    압축된 사본**이다. `browser.ts`의 `dropExtractedPack()`이 `/tmp/chromium`이 있을 때만
    지운다 — 라이브러리가 조기 반환하는 것과 정확히 같은 조건이라, 있으면 죽은 코드고
    없으면 아직 원본이다.
  · **프로필 청소의 주인은 시계가 아니라 커널이다.** 예전 sweep은 5분보다 오래된
    `playwright_*`만 지웠는데, `/tmp`를 실제로 채우는 잔해는 다음 크롤이 시작할 때 몇 초밖에
    안 됐다 — 즉 아무것도 못 지우고 다음 크롤이 꽉 찬 디스크로 들어갔다. 이제
    `/proc/*/cmdline`에서 살아 있는 `--user-data-dir`를 읽어 **아무도 안 쓰는 프로필**을
    나이와 무관하게 지운다. 동시 실행 중인 크롤의 프로필은 우리 것과 똑같이 어리므로,
    나이 기준으로는 둘 다 살리거나 둘 다 죽이는 수밖에 없다.
  · **청소는 teardown에서도 돈다.** launch 직전에만 돌면 원리적으로 늦다 — 그 시점의
    잔해는 어떤 안전한 나이 기준보다도 어리고, 그게 끝났다는 걸 아는 건 그걸 만든 호출뿐이다.
  · `/tmp` 여유가 `TMP_LOW_MB`(120) 아래면 **무엇이 붙잡고 있는지 목록을 로그에 남긴다.**
    이 실패는 원인과 증상이 멀어서, 다음에 또 나면 로그가 스스로 이름을 대야 한다.
  · **그리고 청소로는 풀리지 않는 두 번째 축이 있다 — 동시성**(2026-08-25 실측).
    위의 모든 조치는 "직렬 크롤이 남긴 잔해"를 겨냥한다. 그런데 팬아웃이 리조트 5곳을
    한꺼번에 보내면 **브라우저 다섯 벌이 동시에 살아 있고**, 그건 잔해가 아니라 현역이다.
    `sweepStaleProfiles`는 `/proc`을 물어 사용 중 프로필을 건너뛰므로(⚠️ **믿고 있던
    것이고 08-29에 틀린 것으로 드러났다** — 아래 08-29 항목) 이 압박 앞에서 회수할 것이
    하나도 없다. 525MB짜리 `/tmp`에 크로미움 추출본 하나와
    프로필 다섯이 들어가지 않는다는 것이 전부다.
    같은 뿌리에서 증상이 둘로 갈린다 — 콜드 인스턴스에서는 `/tmp/chromium`을 동시에
    푸느라 **`spawn ETXTBSY`**, 그 뒤로는 **`ERR_INSUFFICIENT_RESOURCES`**.
    조치는 `crawl-resort`의 **전역 동시성 제한**이다(아래 "스케줄링" 절).
    `launchBrowser`의 `ETXTBSY` 한정 재시도는 그 뒤에 남는 좁은 창을 막는 보조 장치일 뿐,
    **자원 부족으로 인한 launch 실패는 재시도하지 않는다** — 더 마른 `/tmp`를 한 번 더
    두드리는 일이고, 두 번째 실패는 더 늦게 오면서 똑같이 읽힌다.
  · **그리고 세 번째 축이 있었다 — 아무도 세지 않은 잔해 한 종류**(2026-08-29).
    그날 09:00 팬아웃에서 오크밸리·리솜·소노가 `TMP_EXHAUSTED`로 거절됐다
    (롯데 2패스·한화 1패스는 그 앞에서 SUCCESS). **이 프로젝트 최초의
    `TMP_EXHAUSTED`이고, 08-27에 만든 거절 경로가 설계대로 동작한 것이다** — 거절
    메시지가 범인의 이름을 직접 댔다: `core.chromium.18` 298MB · `core.chromium.109`
    100MB. 커널 코어 덤프다.
    · **`--single-process`로 뜬 크로미움이 끝날 때 segfault한다.** 패스는 SUCCESS였고
      `browser.close()`도 정상 resolve했으니 죽는 순간의 사고이고, 덤프 크기가 그
      프로세스의 RSS다(298MB·100MB ↔ 그 시각 teardown의 346MB·410MB). SIGKILL은 코어를
      남기지 않으므로 회수 장치들은 범인이 아니다 — **잘 닫힌 브라우저가 남기는 잔해다.**
    · **판별의 결정타는 `목록에 없는 0MB`였다.** 살아 있는 프로세스가 unlink된 fd로
      붙잡은 게 아니라 이름이 멀쩡한 파일이 그냥 거기 있었다. `unaccountedMb`를 로그에
      넣어둔 이유가 정확히 이 갈림이다.
    · 조치는 `CORE_DUMP_NAME`. **나이 기준을 붙이면 안 된다** — 덤프는 teardown 그
      순간에 생기고 그걸 지울 유일한 호출도 같은 teardown의 `reclaimTmp`라,
      `STALE_PROFILE_MS`(90초)를 걸면 언제나 건너뛰어진다(08-29의 간격은 43초·33초).
      코어 덤프는 잔해 중 유일하게 **주인이 존재할 수 없는** 종류다.
    · 예방(덤프를 안 만들기)은 **하지 않았다.** Node에 `setrlimit` 바인딩이 없고
      `core_pattern`은 `/proc/sys`이며 `chromium.launch()`는 `cwd`를 안 준다. 진짜
      레버는 `PACK_ARG_GROUPS.isolation`을 떼는 것인데 그건 **측정된 실험**이지 버그
      수정이 아니다. 대신 `coreDumpPolicy()`가 low-`/tmp` 분기에서 `core_pattern`과
      코어 크기 상한을 찍는다 — 스윕으로 부족해지면 그때 그 레버를 당긴다.
    · 회수는 `crawl_logs`에 `cores=1/298MB` 꼴로 남는다. Hobby가 런타임 로그를 안
      남기므로 **그 칸이 래칫이 끊겼다는 유일한 지속적 증거**다. 성공 행에도 붙는데,
      08-27의 "래칫은 실패 이전에 성공 행에서 먼저 보인다"와 같은 판단이다.
  · ⚠️ **그리고 검증 중에 별개의 버그가 드러났다 — `/proc` 파싱이 한 번도 맞은 적이
    없었다**(2026-08-29). **크로미움은 자기 argv를 공백으로 연결한 문자열 하나로
    덮어쓴다**(리눅스 프로세스 타이틀 방식). `profilesInUse`는 `split("\0")` 후
    `startsWith("--user-data-dir=")`를 봤으므로 그 원소가 **영원히 없었다.** 대가 둘,
    둘 다 조용하다:
    · `sweepStaleProfiles`가 **살아 있는 프로필을 지웠다**(로컬에서 재현 — 브라우저가
      도는 중에 그 `--user-data-dir`가 사라졌다). 위 08-25·08-27 항목이 "사용 중
      프로필은 올바르게 건너뛴다"고 적어둔 것이 사실이 아니었다.
    · `reapAbandoned`가 pid를 못 찾아 "혼자 끝났다"로 판정하고 **SIGKILL 없이**
      `reaped: true`를 신고했다 — 08-27이 만든 회수 장치가 무동작이면서 성공을 보고하고
      있었다는 뜻이다. 프로덕션 로그의 `closeAbandoned=reaped`는 그래서 액면대로 읽으면
      안 된다.
    조치는 NUL **과 공백 둘 다**로 자르는 것(프로필 경로에는 공백이 없다). 로컬 검증:
    고친 뒤 살아 있는 프로필이 옆 크롤의 스윕에서 살아남고, 같은 스윕이 코어는 지운다.
    · 📌 **아직 안 물어본 것**: 고친 `reapAbandoned`가 프로덕션에서 실제로 죽이는가.
      확인은 런타임 로그의 `[browser] reaped abandoned browser {pid}` 유무이고,
      Hobby는 그걸 보관하지 않는다. 필요해지면 `reaped`를 "죽였다"와 "이미 없었다"로
      갈라 `crawl_logs`에 실을 것 — 지금은 실패 경로가 드물어 미뤘다.
- **Playwright를 쓰는 라우트는 `outputFileTracingIncludes`가 필요하다.**
  `playwright-core`는 externalize되고 파일 80개가 트레이스에 들어가지만
  `browsers.json`만 빠진다 — import 시점에 `require`가 아니라 `fs`로 읽어서
  트레이서가 못 본다. 그러면 핸들러 코드가 돌기도 전에 모듈 로드가 실패해
  **500**이 나고, 증상이 지독한 이유는 **`next dev`에서는 멀쩡하다는 것**이다.
  대상은 `/api/inngest`와 `/api/resorts/[slug]/refresh` 둘. 검증:
  `grep browsers.json .next/server/app/api/inngest/route.js.nft.json`.
  · 이것 때문에 **Inngest 앱 sync가 처음부터 불가능**했다. sync는 Inngest가
    `/api/inngest`를 호출해 함수 목록을 읽는 것인데 그 요청이 `serve()`에
    닿지도 못했다. "크론이 안 돈다"의 원인이 크론 설정이 아니라 여기였다.
- **Git 연동이 붙어 있다** — `stayhome` 브랜치에 push하면 프로덕션 배포가 돈다.
  확인 방법은 배포의 별칭 목록에 `stayhome-git-stayhome-*`가 있는지
  (`npx vercel inspect <url>`). 별도 배포 명령은 필요 없다.
  (2026-08-09 이전 이 문서는 "Git 연결이 없다"고 적고 있었다. 틀렸다 —
  `VERCEL_GIT_*`가 함수 런타임에서 비어 보이는 것을 연동 부재로 읽은 것이다.)
- 환경변수는 Vercel에 Sensitive로 등록돼 있어 `vercel env pull`로 **되읽을 수 없다**
  (`[SENSITIVE]`만 나온다). 값 확인은 대시보드에서.
  **이미 돌고 있는 배포에는 소급되지 않는다** — 값을 바꿨으면 재배포해야 한다
  (`npx vercel redeploy stayhome-khaki.vercel.app`).
- **`CHROMIUM_PACK_URL`의 팩 버전은 `playwright-core`가 기대하는 크로미움과
  맞춰야 한다.** 기준은 `node_modules/playwright-core/browsers.json`의
  `browserVersion`이고, 팩은 Sparticuz 릴리스의 같은 메이저를 쓴다
  (playwright 1.60 → Chromium 148 → `chromium-v148.0.0-pack.x64.tar`,
  Vercel 함수는 x64). 한때 131 대 148로 17버전 벌어져 있었는데, 이 어긋남은
  launch까지는 성공하고 한참 뒤 CDP 호출이 이유 없이 실패하는 모양으로 나온다.
  playwright를 올릴 때 `@sparticuz/chromium-min`과 이 URL을 같이 올릴 것.
  · 값이 비어 있으면 `browser.ts`가 Vercel에서 **즉시 던진다**. 예전에는 조용히
    로컬 개발 분기로 새어 "npx playwright install 하세요"라는, 원인과 무관한
    메시지를 남겼다.

### Inngest 설정 (앱 sync)

Inngest는 크론·큐·재시도를 대행하는 외부 서비스다. 우리 코드는 함수 *정의*만
갖고 있고 실행은 Inngest가 시킨다 — 시간이 되면 `/api/inngest`를 HTTPS로 부른다.
**앱 sync**는 Inngest가 그 엔드포인트를 호출해 함수 목록과 크론을 읽어가는 절차이고,
이게 되기 전에는 Inngest가 우리 함수의 존재를 모른다.

- **Vercel 통합**(Inngest → Apps → Sync new app → Vercel)을 쓰면 배포마다 자동
  sync되고, `INNGEST_SIGNING_KEY`/`INNGEST_EVENT_KEY`도 Inngest가 직접 심어준다.
  수동 sync는 함수 정의를 바꿀 때마다 다시 눌러야 한다.
- **Deployment Protection이 sync를 막는다.** 프로덕션 별칭은 열려 있지만 Inngest가
  호출하는 것은 배포마다 생기는 *생성 URL*이고, 그건 `vercel.com/sso-api`로 302된다.
  Settings → Deployment Protection → **Protection Bypass for Automation** 시크릿을
  만들어 Inngest 설정에 넣으면 통과한다(보호를 끄지 않고 기계 하나만 통과시킨다).
  그 시크릿은 프로젝트 전 배포에 통하는 만능 열쇠이므로 저장소나 클라이언트에 두지 말 것.
- 판정: `curl -X PUT https://stayhome-khaki.vercel.app/api/inngest`
  → `{"message":"Successfully registered","modified":true}`면 성공,
  `{"message":"Your signing key is invalid"}`면 키가 아직 옛 값이다(재배포 확인).
  서명 없는 GET이 401인 것은 정상이다.

