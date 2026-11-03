/**
 * 로그인이 없는 앱의 "나" — 브라우저 localStorage에 이름을 기억한다.
 * 모든 접근은 try/catch — 사생활 보호 모드나 저장소 차단에서 throw 할 수 있다.
 */
const NAME_KEY = "teamdinner:name";
const RECENT_KEY = "teamdinner:recent";
const RECENT_MAX = 10;

export interface RecentEvent {
  slug: string;
  title: string;
  placeName: string;
  visitedAt: string;
}

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
    // 저장 실패는 조용히 — 이번 세션 동안은 state로 들고 간다.
  }
}

export function getRecentEvents(): RecentEvent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as RecentEvent[]).filter((e) => e && typeof e.slug === "string") : [];
  } catch {
    return [];
  }
}

export function rememberEvent(e: Omit<RecentEvent, "visitedAt">) {
  try {
    const rest = getRecentEvents().filter((r) => r.slug !== e.slug);
    const next: RecentEvent[] = [{ ...e, visitedAt: new Date().toISOString() }, ...rest].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // 무시
  }
}

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

export function setMemberNameAndNotify(name: string) {
  setMemberName(name);
  emit();
}

let recentRaw: string | null | undefined;
let recentCache: RecentEvent[] = [];

/** 같은 저장 내용이면 같은 배열 참조를 돌려준다 — useSyncExternalStore가 무한 렌더에 빠지지 않도록. */
export function getRecentEventsSnapshot(): RecentEvent[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(RECENT_KEY);
  } catch {
    raw = null;
  }
  if (raw !== recentRaw) {
    recentRaw = raw;
    recentCache = getRecentEvents();
  }
  return recentCache;
}

export function rememberEventAndNotify(e: Omit<RecentEvent, "visitedAt">) {
  rememberEvent(e);
  emit();
}
