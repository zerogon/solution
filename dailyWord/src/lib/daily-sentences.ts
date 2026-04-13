function getDateSeed(): number {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  return year * 10000 + month * 100 + day;
}

export async function getTodaySentence(): Promise<string> {
  const res = await fetch("/api/sentence");
  const data = await res.json();
  return data.sentence;
}

export function getTodayDateKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}년 ${month}월 ${day}일`;
}
