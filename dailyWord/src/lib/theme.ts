// Framer Motion animate prop은 CSS 변수를 보간할 수 없으므로
// 애니메이션에 사용되는 색상은 hex 상수로 관리
export const theme = {
  primary: "#6366f1",    // 인디고
  secondary: "#e8e8f4",  // 연한 라벤더
  card: "#ffffff",
  foreground: "#1e1b4b",
} as const;

// 단어 카드별 조화로운 파스텔 색상 팔레트
export const wordCardColors = [
  { bg: "#fce4ec", text: "#b71c1c", selected: "#e57373" },  // 로즈
  { bg: "#fff3e0", text: "#e65100", selected: "#ffb74d" },  // 오렌지
  { bg: "#fffde7", text: "#f57f17", selected: "#fff176" },  // 옐로우
  { bg: "#e8f5e9", text: "#1b5e20", selected: "#81c784" },  // 그린
  { bg: "#e0f7fa", text: "#006064", selected: "#4dd0e1" },  // 시안
  { bg: "#e8eaf6", text: "#283593", selected: "#7986cb" },  // 인디고
  { bg: "#f3e5f5", text: "#6a1b9a", selected: "#ba68c8" },  // 퍼플
  { bg: "#fce4ec", text: "#c2185b", selected: "#f06292" },  // 핑크
  { bg: "#e0f2f1", text: "#00695c", selected: "#4db6ac" },  // 틸
] as const;
