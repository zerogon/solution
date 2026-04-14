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

const menuDescriptions: Record<number, string> = {
  1: "진하고 부드러운 크림이 얹힌 세이프토피아 대표 시그니처.",
  2: "홍차를 정성껏 우려낸 깊고 고소한 수제 밀크티.",
  3: "깔끔한 바디감이 매력적인 정통 아메리카노.",
  4: "우유의 고소함과 에스프레소가 조화로운 클래식 라떼.",
  5: "달콤한 초콜릿과 에스프레소의 진한 만남.",
  6: "저온에서 천천히 추출한 부드러운 콜드브루.",
  7: "원두 본연의 향을 섬세하게 즐기는 핸드드립.",
  8: "고소한 코코넛 향이 매력적인 이색 커피.",
  9: "세이프토피아만의 시그니처 블렌드 라떼.",
  10: "오트밀크의 부드러움이 돋보이는 비건 친화 라떼.",
  11: "진하게 농축된 한 잔, 커피 본연의 맛.",
  12: "달콤한 초콜릿이 가득한 디저트 같은 라떼.",
  13: "향긋한 국산 녹차가루로 만든 건강한 라떼.",
  14: "상큼한 딸기와 우유가 어우러진 분홍빛 라떼.",
  15: "새콤달콤 유자가 입안 가득 퍼지는 블렌드.",
  16: "신선한 토마토로 만든 건강 한 잔.",
  17: "상큼함 가득, 기분까지 청량해지는 레몬에이드.",
  18: "달콤 쌉쌀한 복자의 깊은 풍미.",
  19: "부드럽고 새하얀 요거트의 상큼한 매력.",
  20: "카페인 걱정 없이 즐기는 깔끔한 디카페인 아메리카노.",
  21: "잠들기 전에도 부담 없는 디카페인 라떼.",
  22: "달콤한 초콜릿은 그대로, 카페인만 쏙 뺀 한 잔.",
  23: "시그니처 세토라떼를 디카페인으로 부담 없이.",
  24: "오트의 고소함을 디카페인으로 편안하게.",
  25: "이국적인 코코넛 향을 늦은 시간에도 즐겨요.",
  26: "진한 풍미는 그대로, 디카페인 에스프레소.",
  27: "상큼한 레몬으로 목을 부드럽게 달래는 한 잔.",
  28: "달콤한 유자 향이 기분까지 풀어주는 차.",
  29: "청량한 페퍼민트로 머릿속까지 상쾌하게.",
  30: "달콤한 복숭아 향이 가득한 시원한 아이스티.",
  31: "사과의 은은한 향이 퍼지는 블렌드 티.",
  32: "산호빛처럼 화사한 머스캣의 달콤함.",
  33: "여름을 닮은 오렌지의 상큼한 향미.",
  34: "톡 쏘는 탄산의 청량감, 깔끔한 미네랄 워터.",
  35: "라임향을 더한 상쾌한 스파클링.",
  36: "사과의 달콤함과 톡 쏘는 탄산의 조화.",
  37: "사과 본연의 풍미를 그대로 즐기는 무탄산.",
  38: "묵직한 자몽의 쌉쌀함과 달콤함이 매력적.",
  39: "사과와 블루베리가 어우러진 베리풍미.",
  40: "바삭하고 달콤한 수제 쿠키로 작은 행복을.",
  41: "담백한 닭가슴살이 든든한 건강 샌드위치.",
  42: "부드러운 에그 스프레드가 가득한 클래식.",
  43: "달콤 짭짤한 불고기로 든든한 한 끼.",
  44: "크림치즈와 딸기의 달콤한 하모니.",
};

export function getMenuDescription(id: number): string {
  return menuDescriptions[id] ?? "";
}

export function pickRandomMenu(): MenuItem {
  const available = menuItems.filter((m) => !m.soldOut);
  return available[Math.floor(Math.random() * available.length)];
}

export function getTodayMenu(zodiacKey?: string): MenuItem {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateSeed =
    kst.getUTCFullYear() * 10000 +
    (kst.getUTCMonth() + 1) * 100 +
    kst.getUTCDate();
  const zodiacOffset = zodiacKey
    ? [...zodiacKey].reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
    : 0;
  const available = menuItems.filter((m) => !m.soldOut);
  return available[(dateSeed + zodiacOffset) % available.length];
}

export function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
}
