/**
 * 예약 이용자명이 사람이 아니라 회사(법인 회원)인가 — `/mail` 예약 불러오기 공용.
 *
 * 법인 계정은 객실을 회사 명의로 먼저 잡아 두고 나중에 사용자를 바꾼다. 그 전까지 이름 칸에는
 * 회사명이 들어 있고, 그걸 메일의 예약자명으로 넣으면 안 된다. 리솜 실측(204건): 165건이 회원명과
 * **완전히 같고**, 25건은 회사명의 **앞부분**(괄호 없는 상호·약칭)이었다. 사람 이름은 어느 쪽도 아니다.
 *
 * 그래서 정규화 뒤 "같음 / 회사명이 이 이름으로 시작(4자 이상) / 이 이름이 회사명으로 시작"이면
 * 회사로 본다. 4자 제한은 3자 사람 이름이 우연히 회사명 앞 세 글자와 같을 때를 막는다.
 */
const norm = (s: string) => s.replace(/\(주\)|㈜|주식회사|\s/g, "");

export function corporateNameMatcher(...corporateNames: (string | null | undefined)[]) {
  const corps = corporateNames.map((c) => norm(c ?? "")).filter((c) => c.length >= 2);
  return (guest: string): boolean => {
    const g = norm(guest);
    if (!g) return true;
    return corps.some((c) => g === c || (g.length >= 4 && c.startsWith(g)) || g.startsWith(c));
  };
}
