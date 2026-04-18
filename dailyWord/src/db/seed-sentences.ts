import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { dailySentences } from "./schema";
import fs from "fs";
import path from "path";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

interface SentenceEntry {
  text: string;
  tag: string;
}

function parseIntigFile(filePath: string): SentenceEntry[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split(/\r?\n/);
  const entries: SentenceEntry[] = [];
  let currentTag = "fortune"; // 기본 태그

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 태그 라인 감지: "-- tag:xxx" 또는 "--tag:xxx"
    const tagMatch = trimmed.match(/^--\s*tag:(\w+)/);
    if (tagMatch) {
      currentTag = tagMatch[1];
      continue;
    }

    // 일반 문장
    entries.push({ text: trimmed, tag: currentTag });
  }

  return entries;
}

async function seed() {
  const filePath = path.join(process.cwd(), "public", "sentenses", "intig.txt");
  console.log("Parsing intig.txt...");
  const entries = parseIntigFile(filePath);
  console.log(`Parsed ${entries.length} sentences`);

  // 태그별 통계
  const tagCounts: Record<string, number> = {};
  for (const e of entries) {
    tagCounts[e.tag] = (tagCounts[e.tag] || 0) + 1;
  }
  console.log("Tag distribution:", tagCounts);

  // 기존 데이터 삭제
  await db.delete(dailySentences);
  console.log("Cleared existing daily_sentences data");

  // 배치 삽입
  const BATCH_SIZE = 50;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await db.insert(dailySentences).values(batch);
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${entries.length} rows`);
  }

  console.log("Daily sentences seed completed!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
