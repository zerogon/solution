"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const DEV_CLEANUP_FLAG = "teamdinner:sw-dev-cleanup";

/**
 * 서비스워커 등록과 업데이트 알림. (stayhome과 같은 구조)
 *
 * 개발 모드에서는 등록하지 않는다 — `sw.js`가 `/_next/static/*`를 cache-first로 잡는데
 * Turbopack 개발 청크는 해시 없는 고정 경로라 한 번 캐시되면 영원히 낡은 모듈이 그려진다.
 * 그래서 dev에서는 이전 세션이 남긴 워커와 캐시를 능동적으로 제거한다.
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
            await Promise.all(keys.filter((k) => k.startsWith("teamdinner-")).map((k) => caches.delete(k)));
          }
          if (navigator.serviceWorker.controller && !sessionStorage.getItem(DEV_CLEANUP_FLAG)) {
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
        if (registration.waiting) promptUpdate(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) promptUpdate(installing);
          });
        });
      })
      .catch(() => {
        // 등록 실패는 조용히 — 오프라인 폴백만 없을 뿐 앱은 정상 동작한다.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
