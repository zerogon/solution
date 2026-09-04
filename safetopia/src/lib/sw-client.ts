/** 서비스워커와 주고받는 메시지 타입. `public/sw.js`의 `message` 핸들러와 짝을 이룬다. */
export const SW_CLEAR_CACHE = "CLEAR_CACHE";

/**
 * 서비스워커가 보관 중인 런타임 캐시를 비운다.
 *
 * 로그아웃 시 호출한다 — `/api/holidays` 응답이 stale-while-revalidate로 캐시에
 * 남아 있어서, 비우지 않으면 로그아웃 후에도(혹은 다른 계정으로 로그인해도)
 * 이전 세션의 조회 결과가 먼저 그려진다.
 *
 * 서비스워커가 없거나 아직 활성화 전이면 조용히 통과한다 — 로그아웃 자체를
 * 막을 이유는 없다.
 */
export async function clearServiceWorkerCaches(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    registration?.active?.postMessage({ type: SW_CLEAR_CACHE });
  } catch {
    // 캐시 정리는 best-effort. 실패해도 로그아웃은 진행돼야 한다.
  }
}
