/**
 * Kill switch for **scheduled** crawling.
 *
 * Set while Phase F is unfinished: 한화 크롤러가 붙기 전까지 정기 수집을 돌리지
 * 않고, 4곳이 아니라 5곳이 다 준비된 상태에서 한 번에 확인한다 (2026-08-11).
 *
 * ## 재개하는 법
 *
 * `PAUSED`를 false로 바꾸고 배포한다. 그게 전부다 — DB도 Inngest 대시보드도
 * 건드릴 것이 없다.
 *
 * ## 왜 크론 트리거를 지우지 않는가
 *
 * `scheduled-refresh`의 cron 표현식은 그대로 두고 함수 **본문**에서 멈춘다.
 * 트리거를 지우면 Inngest 대시보드에 실행이 아예 안 뜨는데, 그 화면은
 * "일부러 껐다"와 "sync가 깨져서 스케줄러가 우리 함수를 모른다"를 구별해주지
 * 않는다. 이 프로젝트는 정확히 후자로 오래 고생했다 — `/api/inngest`가 모듈
 * 로드 단계에서 500이라 크론이 **한 번도** 실행된 적이 없었고, 증상은 "크론이
 * 안 돈다"였지만 원인은 크론 설정이 아니었다 (CLAUDE.md "배포" 절).
 *
 * 3시간마다 no-op 실행이 하나씩 남는 편이 낫다. 그것이 스케줄러가 살아 있다는
 * 증거이자, 멈춰 있는 이유를 자기 입으로 말하는 로그다.
 *
 * ## 무엇이 멈추지 않는가
 *
 * 정기 팬아웃 두 경로(`scheduled-refresh`, `/api/cron/refresh` 백스톱)만 멈춘다.
 * `resort/crawl.requested` 이벤트를 직접 발행하는 것과 조회 화면의 "최신화"
 * 버튼(`POST /api/resorts/[slug]/refresh`)은 그대로 동작한다 — 일시정지의 목적은
 * 자동 수집을 미루는 것이지 리조트를 손으로 확인하는 길까지 막는 것이 아니다.
 */
export const SCHEDULED_CRAWL_PAUSED = true;

/** 로그와 응답에 그대로 실린다. 언제·왜 멈췄는지가 그 자리에서 보이도록. */
export const SCHEDULED_CRAWL_PAUSE_REASON =
  "한화 크롤러 완료 후 재개 예정 (2026-08-11부터 일시정지)";
