import { Session, TimeSlot } from "@/types/agenda";

export const sessions: Session[] = [
  // 오후 1:00
  {
    id: "1-00-t1",
    time: "13:00",
    track: 1,
    title: "고객사례: 카카오스타일의 Databricks 도입기",
    speaker: "박지윤 - 카카오스타일 Data Engineer",
  },
  {
    id: "1-00-t2",
    time: "13:00",
    track: 2,
    title: "고객사례: TMAP의 Databricks 도입 이후의 진짜 과제",
    speaker: "남궁찬 - TMAP 매니저",
  },
  {
    id: "1-00-t3",
    time: "13:00",
    track: 3,
    title: "고객사례: KRAFTON 안티치트를 위한 실시간 ML 가드레일 구축",
    speaker: "유민상 - KRAFTON ML Engineer",
  },
  // 오후 1:30
  {
    id: "1-30-t1",
    time: "13:30",
    track: 1,
    title: "고객사례: NOL UNIVERSE의 Databricks로 구현한 셀프서빙 Segmentation 플랫폼",
    speaker: "김성주 - NOL UNIVERSE 매니저 (Data Scientist)",
  },
  {
    id: "1-30-t2",
    time: "13:30",
    track: 2,
    title: "고객사례: LG U+의 U+one AI 검색 X Databricks LLM 서비스 도입기",
    speaker: "윤형중 - LG U+ 책임 / 조경현 - LG U+ 책임",
  },
  {
    id: "1-30-t3",
    time: "13:30",
    track: 3,
    title: "고객사례: DALPHA의 Databricks 기반 AI Native 온톨로지 구축",
    speaker: "정연길 - DALPHA Dev Tech Lead",
  },
  // 오후 2:00
  {
    id: "2-00-t1",
    time: "14:00",
    track: 1,
    title: "고객사례: 무신사의 Genie를 통한 지표 모니터링 자동화 구축기",
    speaker: "장성국 - MUSINSA Data Analyst",
  },
  {
    id: "2-00-t2",
    time: "14:00",
    track: 2,
    title: "스폰서 세션: DATA DYNAMICS 보안 로그 이상탐지 ML모델 및 성능 관리 체계 구축",
    speaker: "안지민 - Data Dynamics 대리",
  },
  {
    id: "2-00-t3",
    time: "14:00",
    track: 3,
    title: "고객사례: KCD의 AI 프랜차이즈 사업장 탐지 모델",
    speaker: "박윤진 - 한국신용데이터 데이터 분석팀",
  },
  // 오후 2:30
  {
    id: "2-30-t1",
    time: "14:30",
    track: 1,
    title: "고객사례: 카페24 PRO - Closed-Loop 멀티 에이전트 기반 AI 워크플로우",
    speaker: "장현철 - 카페24 Senior AI Researcher / 이성현 - 카페24 AI Researcher",
  },
  {
    id: "2-30-t2",
    time: "14:30",
    track: 2,
    title: "고객사례: 협동조합의 AI 변신 - 한살림 데이터 분석 여정",
    speaker: "정강우 - 한살림 데이터분석팀 팀장",
  },
  {
    id: "2-30-t3",
    time: "14:30",
    track: 3,
    title: "스폰서 세션: MegazoneCloud SAP Business Data Cloud + Databricks",
    speaker: "김철민 - MegazoneCloud Unit Leader",
  },
  // 오후 3:00
  {
    id: "3-00-t1",
    time: "15:00",
    track: 1,
    title: "개발자 세션: Real-time Mode Technical Deep Dive",
    speaker: "임정택 - Databricks Staff Software Engineer",
  },
  {
    id: "3-00-t2",
    time: "15:00",
    track: 2,
    title: "교육세션: Databricks 기반 직무형 데이터 인재 양성 로드맵",
    speaker: "이현수 - Databricks Korea Sr. Technical Instructor / Victoria Cho",
  },
  {
    id: "3-00-t3",
    time: "15:00",
    track: 3,
    title: "고객사례: LG전자 Data Platform Modernization",
    speaker: "이호진 - LG전자 팀장",
  },
  // 오후 3:30 - 휴식
  {
    id: "3-30-break",
    time: "15:30",
    track: 1,
    title: "휴식시간 및 네트워킹",
    speaker: "",
    isBreak: true,
  },
  // 오후 4:00
  {
    id: "4-00-t1",
    time: "16:00",
    track: 1,
    title: "Analytics 기술 세션: Databricks 마이그레이션, 당신이 알아야 할 모든 것",
    speaker: "김지선 - Databricks Korea Sr. Solutions Architect",
  },
  {
    id: "4-00-t2",
    time: "16:00",
    track: 2,
    title: "AI Agent 기술 세션: Databricks + OpenAI Agents SDK 멀티 에이전트 시스템 구축",
    speaker: "김정훈 - Databricks Korea Sr. Solutions Architect",
  },
  {
    id: "4-00-t3",
    time: "16:00",
    track: 3,
    title: "Apps 기술 세션: Lakebase - 완전 관리형 Postgres",
    speaker: "윤종화 - Databricks Korea Solutions Architect",
  },
  // 오후 4:35
  {
    id: "4-35-t1",
    time: "16:35",
    track: 1,
    title: "Analytics 기술 세션: 분석은 SQL처럼, 인사이트는 AI처럼",
    speaker: "조유빈 - Databricks Korea Solutions Architect",
  },
  {
    id: "4-35-t2",
    time: "16:35",
    track: 2,
    title: "AI Agent 기술 세션: Databricks Agent Bricks",
    speaker: "박혜미 - Databricks Korea Sr. Solutions Architect",
  },
  {
    id: "4-35-t3",
    time: "16:35",
    track: 3,
    title: "Apps 기술 세션: Databricks Apps 완전정복",
    speaker: "이정환 - Databricks Korea Sr. Solutions Engineer",
  },
  // 오후 5:10
  {
    id: "5-10-t1",
    time: "17:10",
    track: 1,
    title: "Analytics 기술 세션: 고성능 Genie 만들기 - 튜닝 전략과 Multi-Agent Supervisor 운영 패턴",
    speaker: "민지수 - Databricks Korea Sr. Solutions Engineer",
  },
  {
    id: "5-10-t2",
    time: "17:10",
    track: 2,
    title: "AI Agent 기술 세션: Production 환경에서의 AI Agent 성능 평가 전략",
    speaker: "지승원 - Databricks Korea Sr. Specialist Solutions Engineer",
  },
  {
    id: "5-10-t3",
    time: "17:10",
    track: 3,
    title: "Apps 기술 세션: 바이브 코딩으로 Databricks 생산성 10배",
    speaker: "전종섭 - Databricks Korea Sr. Specialist Solutions Engineer",
  },
];

export function getTimeSlots(): TimeSlot[] {
  const timeMap = new Map<string, Session[]>();

  for (const session of sessions) {
    const existing = timeMap.get(session.time) || [];
    existing.push(session);
    timeMap.set(session.time, existing);
  }

  return Array.from(timeMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, sessions]) => ({
      time,
      sessions: sessions.sort((a, b) => a.track - b.track),
    }));
}

export function getSessionById(id: string): Session | undefined {
  return sessions.find((s) => s.id === id);
}

export function formatTime(time: string): string {
  const [h, m] = time.split(":");
  const hour = parseInt(h);
  return `오후 ${hour > 12 ? hour - 12 : hour}:${m}`;
}
