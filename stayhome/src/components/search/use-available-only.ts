"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "welfarestay:available-only";
const EVENT = "welfarestay:available-only";

/**
 * "예약 가능만 보기" 토글 — 브라우저마다 기억한다(운영자 결정: 기본 꺼짐, 선택 기억).
 *
 * `AppShell`의 사이드바 접힘과 같은 관용구다. `useState` + `useEffect`로 읽으면 첫 페인트가
 * 항상 "꺼짐"이라 켜둔 사람에게 마감 행이 한 프레임 번쩍 보이고, 서버 스냅샷을 false로
 * 고정한 `useSyncExternalStore`는 하이드레이션 불일치 없이 곧바로 저장값을 반영한다.
 * (실제로는 결과가 쿼리 뒤에야 그려져 서버 렌더에 이 값이 쓰일 일이 없지만, 관용구를 갈라놓을 이유도 없다.)
 */
function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

export function useAvailableOnly(): [boolean, (next: boolean) => void] {
  const availableOnly = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return window.localStorage.getItem(KEY) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );

  const set = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // 시크릿 모드 등에서 저장이 막혀도 이번 세션의 토글은 동작해야 한다 — 다만 이벤트만으로는
      // 스냅샷이 저장소를 다시 읽어 같은 값을 돌려주므로, 그 경우 토글은 무동작이다. 수용한다.
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [availableOnly, set];
}
