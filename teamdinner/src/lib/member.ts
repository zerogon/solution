/**
 * 로그인이 없는 앱의 "나" — 브라우저 localStorage에 이름을 기억한다.
 * 모든 접근은 try/catch — 사생활 보호 모드나 저장소 차단에서 throw 할 수 있다.
 */
const NAME_KEY = "teamdinner:name";

export function getMemberName(): string | null {
  try {
    const v = localStorage.getItem(NAME_KEY);
    return v && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

export function setMemberName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name.trim());
  } catch {
    // 저장 실패는 조용히 — 이번 세션 동안은 메모리 스토어가 들고 간다.
    memoryName = name.trim();
  }
}

/** localStorage가 막힌 환경에서의 폴백. */
let memoryName: string | null = null;

// ---- React 구독 (useSyncExternalStore) ----
// effect 안에서 setState 하지 않고도 hydration-safe하게 localStorage를 읽기 위한 외부 스토어.
// 서버 스냅샷은 undefined("아직 모름"), 클라이언트는 실제 값(null = 이름 없음).

const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeMember(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function getMemberNameSnapshot(): string | null {
  return getMemberName() ?? memoryName;
}

export function setMemberNameAndNotify(name: string) {
  setMemberName(name);
  emit();
}
