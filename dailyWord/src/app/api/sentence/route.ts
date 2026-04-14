import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CSV_FILES = [
  "today_fortune_sentences_100.csv",
  "bizarre_office_fortune_100.csv",
  "healing_fortune_100.csv",
  "office_teams_meme_fortune_100.csv",
];

function getDateSeed(): number {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  return year * 10000 + month * 100 + day;
}

function parseCsv(text: string): string[] {
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => line.trim())
    .map((line) => line.replace(/^\d+,/, ""));
}

export async function GET() {
  const dir = path.join(process.cwd(), "public", "sentenses");
  const allSentences: string[] = [];

  for (const file of CSV_FILES) {
    const text = fs.readFileSync(path.join(dir, file), "utf-8");
    allSentences.push(...parseCsv(text));
  }

  const seed = getDateSeed();
  const index = seed % allSentences.length;

  return NextResponse.json({ sentence: allSentences[index] });
}
