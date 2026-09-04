"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/** 개발 모드 정리 후 1회 새로고침을 표시하는 플래그 (무한 루프 방지). */
const DEV_CLEANUP_FLAG = "safetopia:sw-dev-cleanup";

/**
 * 서비스워커 등록과 업데이트 알림.
 *
 * 등록을 설치 프롬프트에서 분리한 이유: 설치 프롬프트는 이미 설치된 사용자나
 * "오늘 하루 보지 않기"를 누른 사용자에게는 조기 return 하는데, 서비스워커 등록은
 * **모든 방문에서** 일어나야 한다(오프라인 캐싱이 설치 여부와 무관하게 동작해야
 * 하고, Chrome의 설치 조건 자체가 활성 워커를 요구한다).
 *
 * ## 개발 모드에서는 등록하지 않는다 (필수)
 * `sw.js`는 `/_next/static/*`를 **cache-first**로 잡는다. 프로덕션 청크는 파일명에
 * 콘텐츠 해시가 있어서 코드가 바뀌면 URL도 바뀌므로 안전하다. 반면 Turbopack **개발**
 * 청크는 해시 없는 고정 경로라, 한 번 캐시되면 서버가 뭘 주든 영원히 낡은 모듈이
 * 그려진다 — 실제로 `utils.ts`에 새 export를 추가했는데 브라우저는 옛 청크를 계속
 * 실행해 `formatKoMd is not a function`이 났다. `.next` 삭제나 서버 재시작으로는
 * 못 고친다(낡은 사본이 브라우저에 있다).
 *
 * 그래서 dev에서는 등록을 건너뛰는 데 그치지 않고, 이전 세션이 남긴 워커와 캐시를
 * **능동적으로 제거**한다. 안 그러면 이미 워커가 박힌 브라우저는 계속 깨진 채로 남는다.
 */
export function ServiceWorkerManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void (async () => {
        try {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((r) => r.unregister()));

          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys
                .filter((k) => k.startsWith("safetopia-"))
                .map((k) => caches.delete(k)),
            );
          }

          // 이 페이지가 이미 낡은 워커의 통제를 받고 있었다면 청크도 낡은 상태다.
          // 정리만으로는 현재 문서가 안 고쳐지므로 한 번만 새로고침한다.
          if (
            navigator.serviceWorker.controller &&
            !sessionStorage.getItem(DEV_CLEANUP_FLAG)
          ) {
            sessionStorage.setItem(DEV_CLEANUP_FLAG, "1");
            window.location.reload();
          }
        } catch {
          // 정리 실패가 개발을 막을 이유는 없다.
        }
      })();
      return;
    }

    let cancelled = false;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (cancelled) return;

        const promptUpdate = (worker: ServiceWorker) => {
          toast("새 버전이 준비됐습니다", {
            description: "새로고침하면 최신 버전으로 전환됩니다.",
            duration: Infinity,
            action: {
              label: "새로고침",
              onClick: () => {
                worker.postMessage({ type: "SKIP_WAITING" });
                window.location.reload();
              },
            },
          });
        };

        // 이미 대기 중인 워커가 있는 경우(이전 방문에서 받아둔 새 버전).
        if (registration.waiting) promptUpdate(registration.waiting);

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            // controller가 있다는 건 첫 설치가 아니라 "교체"라는 뜻 —
            // 첫 설치에서까지 새로고침을 권하면 안 된다.
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              promptUpdate(installing);
            }
          });
        });
      })
      .catch(() => {
        // 등록 실패는 조용히 넘긴다 — 오프라인 캐싱만 없을 뿐 앱은 정상 동작한다.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
