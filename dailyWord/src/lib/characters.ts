export type Rarity = "common" | "rare" | "legendary";

export interface Character {
  id: string;
  name: string;
  emoji: string;
  lottieUrl: string;
  rarity: Rarity;
  greeting: string;
}

export const characters: Character[] = [
  // === Common (친근한 동물) ===
  {
    id: "bear",
    name: "뭉이",
    emoji: "🐻",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/4c453e6c-945f-4def-9ee3-a3d83801e046/dPhiMYTML4.json",
    rarity: "common",
    greeting: "오늘 하루도 화이팅!",
  },
  {
    id: "chick",
    name: "삐약이",
    emoji: "🐥",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/e8a3fe58-1d3a-11f0-978d-b3e0f8c8356f/O9eFZEYswe.json",
    rarity: "common",
    greeting: "삐약! 오늘도 빛나는 하루!",
  },
  {
    id: "turtle",
    name: "거북이",
    emoji: "🐢",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/59b9c1b4-1175-11ee-8e90-0717b340e42c/jFjPOLOIOC.json",
    rarity: "common",
    greeting: "천천히, 꾸준히, 오늘도 한 걸음!",
  },
  {
    id: "squirrel",
    name: "다람이",
    emoji: "🐿️",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/7f39ab52-1175-11ee-b0e7-7f4e9042b56e/yXlKTPZwuM.json",
    rarity: "common",
    greeting: "도토리처럼 소소한 행복을 모아요!",
  },
  // === Rare (귀여운 동물) ===
  {
    id: "dog",
    name: "해피",
    emoji: "🐶",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/47f6f3c6-1174-11ee-97b7-ff6e4869941b/U0AzGbFb9C.json",
    rarity: "rare",
    greeting: "멍멍! 행운이 따라올 거예요!",
  },
  {
    id: "panda",
    name: "판다",
    emoji: "🐼",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/b4a36478-116f-11ee-853a-4b10f0fcece4/WBnM83N9k4.json",
    rarity: "rare",
    greeting: "느긋하게, 하지만 멋지게!",
  },
  {
    id: "sheep",
    name: "뭉실이",
    emoji: "🐑",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/a76e2e72-1175-11ee-8215-dfbbb3ce7026/VBM6Sx8Yrx.json",
    rarity: "rare",
    greeting: "포근한 하루가 될 거예요~",
  },
  {
    id: "koala",
    name: "코코",
    emoji: "🐨",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/c0b0d4d0-1175-11ee-baf7-a366c7a6045c/XjHNMqQHri.json",
    rarity: "rare",
    greeting: "꼭 안아주고 싶은 하루!",
  },
  // === Legendary (가장 귀엽고 특별한) ===
  {
    id: "penguin",
    name: "펭수",
    emoji: "🐧",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/b63d1344-118b-11ee-a864-4ba9cbc5d241/m5igPoFjkT.json",
    rarity: "legendary",
    greeting: "🎉 대박! 오늘은 특별한 날이에요!",
  },
  {
    id: "unicorn",
    name: "유니",
    emoji: "🦄",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/9b25593a-8959-11ef-b6a0-67dea89b1e93/fMsGqefQJC.json",
    rarity: "legendary",
    greeting: "✨ 꿈이 이루어지는 마법의 하루!",
  },
  {
    id: "fox",
    name: "별이",
    emoji: "🦊",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/d6ef5c4e-1175-11ee-9837-47c5e3bfab40/NlxmjAOaK7.json",
    rarity: "legendary",
    greeting: "🌟 반짝반짝! 별처럼 빛나는 하루!",
  },
  {
    id: "bunny",
    name: "루미",
    emoji: "🐰",
    lottieUrl:
      "https://assets-v2.lottiefiles.com/a/421cce62-8969-41dc-9d9e-15a22cfbc867/a72SOjbNMm.json",
    rarity: "legendary",
    greeting: "💖 세상에서 제일 특별한 당신에게!",
  },
];

const rarityWeights: Record<Rarity, number> = {
  common: 70,
  rare: 25,
  legendary: 5,
};

export function pickRandomCharacter(): Character {
  const weighted = characters.flatMap((c) => {
    const weight = rarityWeights[c.rarity];
    const count = characters.filter((x) => x.rarity === c.rarity).length;
    return Array(Math.round(weight / count)).fill(c);
  });

  return weighted[Math.floor(Math.random() * weighted.length)];
}

export const rarityConfig: Record<
  Rarity,
  { label: string; color: string; bg: string; glow: string }
> = {
  common: {
    label: "⭐⭐⭐",
    color: "text-sky-600",
    bg: "bg-sky-50",
    glow: "shadow-sky-200/50",
  },
  rare: {
    label: "⭐⭐⭐⭐",
    color: "text-purple-600",
    bg: "bg-purple-50",
    glow: "shadow-purple-200/50",
  },
  legendary: {
    label: "⭐⭐⭐⭐⭐",
    color: "text-amber-600",
    bg: "bg-amber-50",
    glow: "shadow-amber-200/50",
  },
};
