<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

---

# Lotte 셀렉터 캡처

`src/crawlers/lotte/config.ts`의 모든 `"TODO"` 값은 실제 사이트에서 캡처해 채워야 합니다. 절차:

## 1) Playwright codegen 실행

```bash
npx playwright install chromium    # 최초 1회
npx playwright codegen https://www.lotteresort.com/login
```

브라우저 창이 뜨면 다음을 순서대로 수행하세요:

1. **로그인 폼 입력** (실제 ID/비밀번호 사용) → 로그인 성공 페이지까지 도달
2. **검색 페이지로 이동** (예약/객실 검색)
3. **체크인 날짜, 체크아웃 날짜, 지점 선택** 후 검색
4. **결과 카드/행이 보일 때까지 스크롤**

이 과정에서 codegen 창 우측에 생성된 코드를 복사해 두세요.

## 2) `config.ts`에 셀렉터 채우기

codegen이 만든 locator를 `src/crawlers/lotte/config.ts`의 각 위치에 옮깁니다. 우선순위:

- `data-*` 또는 `[name="..."]` 속성 우선
- `:has-text("...")` 같은 텍스트 매칭은 사이트 문구 변경에 취약하므로 차선
- `nth-child` / 좌표 셀렉터는 피하기

`assertConfigured()`가 자동으로 `"TODO"` 잔여를 검출해 에러로 알려줍니다.

## 3) 로컬에서 동작 확인

```bash
npm run dev
# 브라우저 → /admin/accounts → Lotte 계정(실 자격증명) 등록
# /admin/crawl-logs → "수동 새로고침" 클릭
```

성공 조건:
- `crawl_logs` 테이블에 `status=SUCCESS`, `rows_upserted > 0`
- `resort_inventory` 테이블에 행이 upsert됨
- `resort_sessions` 테이블에 `storage_state`가 저장됨
- 6시간 내 재실행 시 로그인 단계 스킵 (콘솔 로그 `session valid, skipping login`)

## 4) Resort 활성화

성공 후 Neon SQL 콘솔 또는 Prisma Studio에서:
```sql
UPDATE resorts SET active = true WHERE slug = 'LOTTE';
```

## 셀렉터 변경 시

- 사이트 UI가 바뀌면 `crawl_logs.error_stage = SEARCH` 또는 `PARSE`로 표시됩니다.
- `config.ts`만 수정하면 됩니다. login/search/parse 코드는 셀렉터 키만 참조하므로 무수정.

---

# 새 리조트 추가 (Phase F)

1. `src/crawlers/<slug>/{config,login,search,parse,index}.ts` 작성 (lotte 복사 후 수정)
2. `src/crawlers/registry.ts`에 lazy import 1줄 추가
3. (Phase C 이후) `src/lib/inngest/functions/<slug>.ts` 추가
4. Neon에서 `UPDATE resorts SET active = true WHERE slug = '<SLUG>'`

핵심 코드(`run.ts`, `_shared/*`)는 무수정.
