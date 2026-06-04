import { Specialty } from "@/generated/prisma/enums";

/** 전공 한글 라벨 */
export const SPECIALTY_LABEL: Record<Specialty, string> = {
  CLASSICAL: "클래식",
  JAZZ: "재즈",
  ACCOMPANIMENT: "반주",
};

/** 표시·정렬용 고정 순서 */
export const SPECIALTY_ORDER: Specialty[] = [
  Specialty.CLASSICAL,
  Specialty.JAZZ,
  Specialty.ACCOMPANIMENT,
];

/** 전공 배열을 고정 순서로 정렬해 반환 */
export function sortSpecialties(specialties: Specialty[]): Specialty[] {
  return SPECIALTY_ORDER.filter((s) => specialties.includes(s));
}

/** 전공 배열을 "클래식, 재즈" 형태의 라벨 문자열로 (비어있으면 빈 문자열) */
export function specialtyLabels(specialties: Specialty[]): string {
  return sortSpecialties(specialties)
    .map((s) => SPECIALTY_LABEL[s])
    .join(", ");
}
