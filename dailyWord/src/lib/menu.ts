export interface MenuItem {
  id: number;
  name: string;
  price: number;
  category: string;
  image?: string;
  soldOut?: boolean;
}

export const menuItems: MenuItem[] = [
  // 시그니처
  { id: 1, name: "삼성동 크림라떼", price: 4700, category: "시그니처", image: "4cc650c6-c98f-44fb-8fb6-1c3c05db225e.webp" },
  { id: 2, name: "수제밀크티", price: 3800, category: "시그니처", image: "7399bc8f-4d9c-4512-9fd6-0e80167fa69a.webp" },
  // 커피
  { id: 3, name: "아메리카노", price: 1000, category: "커피", image: "e8a3de88-853a-4045-8cd1-4b35b9a700db.webp" },
  { id: 4, name: "카페라떼", price: 2000, category: "커피", image: "28cd8a08-5258-41a6-b0fb-b15b9efbee7f.webp" },
  { id: 5, name: "카페모카", price: 2700, category: "커피", image: "0cd8bcd5-611f-43c5-9940-0fd38b443045.webp" },
  { id: 6, name: "콜드브루", price: 3000, category: "커피", image: "82b466af-f191-45a7-854a-ef4a02816066.webp" },
  { id: 7, name: "드립커피", price: 3200, category: "커피", image: "d0352c2a-ddb3-499c-9e19-47f0b7efdafd.webp" },
  { id: 8, name: "코코넛커피", price: 3500, category: "커피", image: "5ab2ef08-49dd-4d97-af5c-2a18a09b924a.webp" },
  { id: 9, name: "세토라떼", price: 2200, category: "커피", image: "033cc9a4-9303-4122-8dc4-d619455d0f0d.webp" },
  { id: 10, name: "오트라떼", price: 3000, category: "커피", image: "51905601-cee0-467e-abdd-ea33db3116b2.webp" },
  { id: 11, name: "에스프레소", price: 1500, category: "커피", image: "53fa0e8c-55fd-4d13-9ff1-a0e3f0ff89f7.webp" },
  // 논커피
  { id: 12, name: "초코라떼", price: 2700, category: "논커피", image: "a529f114-42fe-4ae1-bb64-b6b86b7ea491.webp" },
  { id: 13, name: "녹차라떼", price: 2900, category: "논커피", image: "9cfa0b77-59e8-466d-a27d-f70da36c4910.webp" },
  { id: 14, name: "딸기라떼", price: 3800, category: "논커피", image: "4b1f080b-b9cf-4c73-95d8-46686ec5107f.webp" },
  { id: 15, name: "유자블렌드", price: 3700, category: "논커피", image: "46b776dc-b4d9-4a0d-950b-cf0771166430.webp" },
  { id: 16, name: "토마토주스", price: 3800, category: "논커피", image: "81faefb2-bb93-44c7-a4cc-c0b10911c983.webp" },
  { id: 17, name: "레몬에이드", price: 4000, category: "논커피", image: "1adeece2-031b-45b8-9db2-d12fc1855ee3.webp" },
  { id: 18, name: "복자라떼", price: 3800, category: "논커피", image: "ceb6e230-0429-4fc7-8ab5-4fd107619efa.webp" },
  { id: 19, name: "화이트요거트", price: 3700, category: "논커피", image: "10ec9dc8-5a86-4247-b204-7f262feaf939.webp" },
  // 디카페인
  { id: 20, name: "De아메리카노", price: 2000, category: "디카페인" },
  { id: 21, name: "De카페라떼", price: 3000, category: "디카페인" },
  { id: 22, name: "De카페모카", price: 3700, category: "디카페인" },
  { id: 23, name: "De세토라떼", price: 3200, category: "디카페인" },
  { id: 24, name: "De오트라떼", price: 4000, category: "디카페인" },
  { id: 25, name: "De코코넛커피", price: 4500, category: "디카페인" },
  { id: 26, name: "De에스프레소", price: 2500, category: "디카페인" },
  // 티
  { id: 27, name: "레몬차", price: 3500, category: "티" },
  { id: 28, name: "유자차", price: 3500, category: "티" },
  { id: 29, name: "페퍼민트", price: 3200, category: "티" },
  { id: 30, name: "복숭아 아이스티", price: 3200, category: "티" },
  { id: 31, name: "애플블렌드", price: 3200, category: "티" },
  { id: 32, name: "코랄머스캣", price: 3200, category: "티" },
  { id: 33, name: "썸머오렌지", price: 4000, category: "티" },
  // 병음료
  { id: 34, name: "페리에 플레인", price: 3000, category: "병음료" },
  { id: 35, name: "페리에 라임", price: 3000, category: "병음료" },
  { id: 36, name: "애플 탄산", price: 3200, category: "병음료" },
  { id: 37, name: "애플 무탄산", price: 3500, category: "병음료" },
  { id: 38, name: "분다버그 자몽", price: 4000, category: "병음료" },
  { id: 39, name: "애플블루베리", price: 4000, category: "병음료" },
  // 디저트
  { id: 40, name: "쿠키", price: 1800, category: "디저트" },
  { id: 41, name: "닭가슴살 샌드위치", price: 3700, category: "디저트" },
  { id: 42, name: "에그 샌드위치", price: 3700, category: "디저트" },
  { id: 43, name: "불고기 샌드위치", price: 3700, category: "디저트" },
  { id: 44, name: "크림치즈 딸기파이", price: 2500, category: "디저트", soldOut: true },
];

const categoryEmoji: Record<string, string> = {
  시그니처: "⭐",
  커피: "☕",
  논커피: "🥤",
  디카페인: "🌿",
  티: "🍵",
  병음료: "🍾",
  디저트: "🍪",
};

export function getCategoryEmoji(category: string): string {
  return categoryEmoji[category] ?? "☕";
}

export function pickRandomMenu(): MenuItem {
  const available = menuItems.filter((m) => !m.soldOut);
  return available[Math.floor(Math.random() * available.length)];
}

export function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}
