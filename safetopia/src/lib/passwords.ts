import { randomInt } from "node:crypto";

/** 헷갈리는 글자(0/O, 1/l/I)를 뺀 임시 비밀번호 8자. 관리자가 구두로 전달하기 좋게. */
export function generateTempPassword(length = 8): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}
