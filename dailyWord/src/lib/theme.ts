// Framer Motion animate prop은 CSS 변수를 보간할 수 없으므로
// 애니메이션에 사용되는 색상은 hex 상수로 관리
export const theme = {
  primary: "#6366f1",    // 인디고
  secondary: "#e8e8f4",  // 연한 라벤더
  card: "#ffffff",
  foreground: "#1e1b4b",
} as const;
