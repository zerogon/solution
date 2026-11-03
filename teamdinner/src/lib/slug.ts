import { customAlphabet } from "nanoid";

/** 혼동되는 글자(0/O, 1/l/I)를 뺀 소문자+숫자 10자. 공유 링크가 곧 접근 권한이라 추측 불가해야 한다. */
const alphabet = "23456789abcdefghjkmnpqrstuvwxyz";
export const newSlug = customAlphabet(alphabet, 10);

export const SLUG_RE = /^[23456789abcdefghjkmnpqrstuvwxyz]{10}$/;
