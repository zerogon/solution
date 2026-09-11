# 인수인계 — 소노 세부 타입(변형) 수집·표시 작업 (2026-09-11)

이 문서는 **평소 작업 PC가 아닌 다른 PC**에서 진행한 작업을 평소 PC로 옮기기 위한 것이다.
여기서 한 일, 하지 못한 일, 옮기는 방법, 옮긴 뒤 할 일을 순서대로 적는다.

## 1. 한 줄 요약

소노 객실유형 아래의 세부 타입(뷰: 스탠다드/파크뷰, 세부: 더블취사/트윈취사 …)을
조회 화면에 보여주는 기능의 **코드·문서·오프라인 검증을 끝냈다.** 실계정 조사(`debug-sono.ts variants`)와
DB 컬럼 추가(`db:push`), 실측은 **이 PC에 `.env`가 없어 하지 못했다.** 변경은 `feat/sono-variants` 브랜치에 커밋했다.

## 2. 이 PC의 상태

- `stayhome` HEAD `9e73bbf` (마감일 계산기 D-10 커밋)에서 분기한 `feat/sono-variants`에 **변경 15개 파일 + 이 문서**.
- 변경 파일 13개, 신규 파일 2개:

| 구분 | 파일 | 내용 |
| --- | --- | --- |
| 신규 | `src/lib/variants.ts` | `InventoryVariant` 계약 + `isVariantList` 가드 |
| 신규 | `src/components/search/RoomRow.tsx` | 행 껍질 + 세부 목록 펼침(클라이언트 컴포넌트) |
| 수정 | `src/crawlers/sono/parse.ts` | 변형 단위 판정, 행 상태를 변형에서 유도, `variants` 부착 |
| 수정 | `src/crawlers/sono/config.ts` | `viewNames` 빈 표(뷰 코드 → 이름) |
| 수정 | `src/crawlers/sono/search.ts` | 이름 없는 `viewCd` 배치당 1회 로그 |
| 수정 | `src/crawlers/types.ts` | `InventoryRow.variants?` |
| 수정 | `prisma/schema.prisma` | `ResortInventory.variants Json? @db.JsonB` |
| 수정 | `src/crawlers/run.ts` | upsert 세 곳에 `variants`, 바인드 16 → 17 주석 |
| 수정 | `src/app/api/inventory/route.ts` | select + `isVariantList` 검사 매핑 |
| 수정 | `src/components/search/types.ts` | 클라이언트 `InventoryRow.variants` |
| 수정 | `src/components/search/BranchResultSection.tsx` | `<li>`를 `RoomRow`로 감쌈 |
| 수정 | `public/sw.js` | `CACHE_VERSION` v4 → v5 |
| 수정 | `scripts/debug-sono.ts` | `variants` 조사 스텝(5파트), `Capture.reqHeaders`, 마스킹 헬퍼 |
| 수정 | `CLAUDE.md` | 새 절 "소노 변형(뷰 축) 수집", 바인드 수 12 → 17 정정, 수동 요금 절 문구 |
| 수정 | `AGENTS.md` | 소노 절 소절 "변형은 뷰 축이고 이름은 응답에 없다", 검증 SQL, 명령 목록 |

- 위 변경은 이 PC에서 **브랜치 `feat/sono-variants`로 커밋·푸시했다**(2026-09-11). `stayhome`에는
  올리지 않았다 — 아래 3절의 경고.
- 이 PC에서 추가로 한 것: `npx playwright install chromium`(로컬 크로미움), `npx prisma generate`.
  둘 다 저장소 밖 산출물이라 옮길 필요 없다.

## 3. 옮기는 방법

평소 PC의 저장소 루트(`solution/`)에서:

```bash
git fetch origin
git checkout feat/sono-variants
cd stayhome && npx prisma generate && npx tsc --noEmit
```

`stayhome` 브랜치에 합치는 것은 **아래 4절의 5번(`db:push`)을 마친 뒤**에 한다.

⚠️ **`stayhome` 브랜치로 먼저 푸시하면 안 된다.** Git 연동으로 프로덕션 배포가 돌고,
`db:push`가 안 된 상태에서 새 코드가 배포되면 `/api/inventory`가 없는 컬럼 `variants`를
select 하다가 **500**이 난다. 배포 순서는 반드시 `db:push` → `stayhome` 머지/푸시다.

## 4. 평소 PC에서 할 일 (순서대로)

1. **`.env` 있는지 확인**(`DATABASE_URL`, `DIRECT_URL`, `RESORT_CRED_SECRET`). 이게 없어서 여기서 막혔다.
2. **실계정 조사**:
   ```bash
   npx tsx scripts/debug-sono.ts doLogin
   npx tsx scripts/debug-sono.ts variants            # 기본: 청송·비발디A·고양·제주
   # Part 3c(room/detail 재현)가 자동 클릭에서 막히면:
   SONO_FLOW_MANUAL=1 CRAWLER_HEADLESS=false npx tsx scripts/debug-sono.ts variants
   ```
   출력에서 볼 것:
   - Part 1 마지막 줄: `viewCd`가 **전역 어휘인지 지점별인지** → `SONO.viewNames` 키를 `"01"`로 할지 `"66:01"`로 할지.
   - Part 2 `★ 2박 행 … 갈리는 행 N`: 종전 접기가 거짓 예약 가능으로 내던 행 수. 문서에 적을 근거 숫자.
   - Part 3c 판정표(H1/H2/H3)와 Part 4·5: 세부 축 GO 조건 넷이 다 맞는지.
3. **`viewNames` 채우기**: 헤드 브라우저로 객실 선택 화면을 열어 뷰 이름과 잔여 수를 `rsvRmCnt`와 대조해
   코드 → 이름을 확인하고 `src/crawlers/sono/config.ts`의 `viewNames`에 넣는다. 항목마다 확인 날짜·방법을 주석으로.
   표가 비어 있으면 화면 라벨이 `viewCd` 코드 그대로 나온다(의도된 강등, 크롤 로그 `[sono] unnamed viewCd`).
4. **세부 축 GO면** `parse.ts`의 `variantLabel`을 `room/detail`의 `viewNm`·`bedNm`·`cookNm`으로 확장한다.
   그릇(`variants` 배열·UI)은 그대로다. NO-GO면 실패한 기준을 `AGENTS.md`에 적고 뷰 축만 배포한다.
5. **DB 컬럼 추가**: `npm run db:push` (이 저장소는 `prisma/migrations/`가 없다).
6. **실측**:
   ```bash
   npx tsx scripts/run-crawl.ts SONO "소노벨 청송"
   npx tsx scripts/run-crawl.ts SONO hot                 # 60/60 · 행 수 ≈ 17,914 · 패스 시간 vs 35.7초
   CRAWL_BUDGET_MS=50000 npx tsx scripts/run-crawl.ts SONO hot
   npx tsx scripts/run-crawl.ts LOTTE                    # 회귀 없음 · variants IS NULL
   ```
   같은 크롤을 **두 번** 돌려 `DO UPDATE SET`이 `variants`를 갱신하는지 본다.
   검증 SQL은 `AGENTS.md` 소노 절 "변형은 뷰 축이고 이름은 응답에 없다" 끝에 있다.
7. **UI 확인**: 데스크톱·390px에서 변형 ≥2 행에만 쉐브론, 펼침/접힘, 낡은 행은 회색 칩, 콘솔 에러 0.
8. 문서의 "실사이트 조사 대기" 표기를 실측 결과로 바꾸고 커밋 → `stayhome` 푸시(5번 이후에만).

## 5. 여기서 검증한 것 (DB 없이 가능한 범위)

- `npx tsc --noEmit`, `npx eslint`(변경 파일 전부), `npm run build` 통과.
- 클라이언트 번들(`.next/static`)에 `storeCd`·`viewNames`·`rmTypeCd`·`viewCd`·`memberReservation` 유출 0건.
- 합성 페이로드로 파서 불변식 5케이스 통과:
  - 1박은 옛 접기와 판정 동치.
  - 2박 갈림(1박째 스탠다드만·2박째 파크뷰만 가능)에서 행은 남고 `available`만 false.
  - 가능한 변형이 전부 `E`면 행은 마감임박, `W`의 음수 잔여는 `null`.
  - 같은 `viewCd`에 `rmTypeCd`가 둘이면 라벨 `01 (X1)`·`01 (X2)`.
  - 변형 1개 행도 길이 1 배열, 밤 하나 빠진 변형은 목록에서만 탈락.

## 6. 설계 요점 (자세한 근거는 CLAUDE.md 새 절)

- **행이 아니라 컬럼.** 변형을 행으로 펼치면 소노 행이 1.5~3배가 되어 필터 칩의 "예약 가능 N건"이
  부풀고, `(지점, roomType)` 조인의 수동 요금이 전부 고아가 된다. 세부 목록은 행의 분해이지 새 판정이 아니다.
- **행 상태를 변형에서 유도한다.** 어느 한 변형이 전 숙박 예약 가능해야 행이 가능. 2박 이상에서 종전 접기의
  거짓 예약 가능이 고쳐진다(2026-08-09 소노 2박 버그와 같은 계보). 행 수는 변하지 않는다.
- **`remaining` = 전 밤 중 최소**(가능할 때만). **모르는 코드에 이름을 지어내지 않는다.**
- **변형의 색은 행의 `syncedAt`**으로 판정한다. 낡은 행 아래 초록 칩은 신선도 장치가 막으려는 모순이다.
- `/api/inventory` 응답 shape이 바뀌어 `sw.js` `CACHE_VERSION` v5.

## 7. 운영자 결정 기록 (2026-09-11)

1. 표시 방식: 접힌 행 아래 세부 목록(행 분리 아님).
2. 조사 게이트: 뷰 축 먼저 붙이고 보고, 세부 축은 `room/detail`이 열릴 때만.

## 8. 참고

- 설계 원문: `CLAUDE.md` "## 소노 변형(뷰 축) 수집" 절, `AGENTS.md` 소노 절 "### 변형은 뷰 축이고 이름은 응답에 없다".
- 조사 스텝 코드: `scripts/debug-sono.ts`의 `step === "variants"` 분기(약 1325행부터).
- 이 PC의 Claude 메모리에도 ".env 부재 · 후속 미실행" 사실을 남겼다. 평소 PC의 메모리에는 없으니
  이 문서가 유일한 인수인계 기록이다.
