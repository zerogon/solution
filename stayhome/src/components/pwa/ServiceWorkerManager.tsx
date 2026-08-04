"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * 서비스워커 등록과 업데이트 알림.
 *
 * 등록을 설치 프롬프트에서 분리한 이유: 설치 프롬프트는 이미 설치된 사용자나
 * "오늘 하루 보지 않기"를 누른 사용자에게는 조기 return 하는데, 서비스워커 등록은
 * **모든 방문에서** 일어나야 한다(오프라인 캐싱이 설치 여부와 무관하게 동작해야
 * 하고, Chrome의 설치 조건 자체가 활성 워커를 요구한다).
 */
export function ServiceWorkerManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

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
