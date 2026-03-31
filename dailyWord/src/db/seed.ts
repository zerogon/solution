import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { words, messages, selections, visits } from "./schema";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql);

const WORDS = [
  { word: "행복", displayOrder: 1 },
  { word: "자유", displayOrder: 2 },
  { word: "성장", displayOrder: 3 },
  { word: "희망", displayOrder: 4 },
  { word: "용기", displayOrder: 5 },
  { word: "사랑", displayOrder: 6 },
  { word: "도전", displayOrder: 7 },
  { word: "발전", displayOrder: 8 },
];

const MESSAGES: Record<string, string[]> = {
  행복: [
    "작은 미소가 오늘 하루의 큰 행복이 됩니다.",
    "행복은 멀리 있지 않아요. 지금 이 순간이 행복입니다.",
    "당신이 웃는 것만으로도 세상이 조금 더 밝아집니다.",
  ],
  자유: [
    "오늘 하루, 마음이 가는 대로 살아보세요.",
    "자유는 용기에서 시작됩니다. 당신은 이미 자유롭습니다.",
    "바람처럼 가볍게, 오늘도 당신답게 살아가세요.",
  ],
  성장: [
    "어제보다 한 뼘 더 자란 오늘의 당신을 응원합니다.",
    "실수해도 괜찮아요. 그것이 성장의 시작이니까요.",
    "매일 조금씩, 당신은 더 멋진 사람이 되고 있어요.",
  ],
  희망: [
    "오늘이 힘들어도, 내일은 분명 더 좋은 날이 될 거예요.",
    "작은 희망 하나가 세상을 바꿀 수 있습니다.",
    "포기하지 마세요. 당신의 내일은 밝게 빛날 거예요.",
  ],
  용기: [
    "한 걸음만 내딛으면 됩니다. 당신은 이미 충분히 용감합니다.",
    "두려움 뒤에 숨어있는 멋진 세계가 당신을 기다리고 있어요.",
    "용기란 두려움이 없는 것이 아니라, 두려움에도 나아가는 것입니다.",
  ],
  사랑: [
    "오늘 하루, 당신 자신을 조금 더 사랑해 주세요.",
    "사랑은 주는 만큼 돌아옵니다. 따뜻한 하루 되세요.",
    "당신은 사랑받을 자격이 충분한 사람입니다.",
  ],
  도전: [
    "새로운 시작은 언제나 설레는 법이에요. 도전하세요!",
    "실패를 두려워하지 마세요. 도전 자체가 이미 승리입니다.",
    "오늘의 작은 도전이 내일의 큰 변화를 만듭니다.",
  ],
  발전: [
    "꾸준함이 가장 큰 발전의 비결입니다.",
    "오늘 배운 것 하나가 내일의 나를 만들어요.",
    "멈추지 않는 한, 당신은 계속 발전하고 있습니다.",
  ],
};

async function seed() {
  console.log("Seeding database...");

  // 기존 데이터 삭제 (FK 순서)
  await db.delete(selections);
  await db.delete(visits);
  await db.delete(messages);
  await db.delete(words);

  // 단어 삽입
  const insertedWords = await db.insert(words).values(WORDS).returning();
  console.log(`Inserted ${insertedWords.length} words`);

  // 메시지 삽입
  const messageValues = insertedWords.flatMap((w) =>
    (MESSAGES[w.word] ?? []).map((msg) => ({
      wordId: w.id,
      message: msg,
    }))
  );

  const insertedMessages = await db
    .insert(messages)
    .values(messageValues)
    .returning();
  console.log(`Inserted ${insertedMessages.length} messages`);

  console.log("Seed completed!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
