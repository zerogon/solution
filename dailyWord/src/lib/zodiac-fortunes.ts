export interface ZodiacFortune {
  overall: string;
  love: string;
  money: string;
  health: string;
  luckyColor: string;
  luckyNumber: number;
  overallScore: number; // 1-5
  loveScore: number;
  moneyScore: number;
  healthScore: number;
}

const MONKEY_FORTUNES: ZodiacFortune[] = [
  {
    overall: "활기찬 에너지가 넘치는 하루입니다. 새로운 도전을 시작하기에 좋은 날이니, 미루던 일이 있다면 오늘 시작해보세요. 주변 사람들과의 소통에서 좋은 아이디어를 얻을 수 있습니다.",
    love: "연인과 함께하는 시간이 특별하게 느껴질 거예요. 솔로라면 우연한 만남에서 설렘을 느낄 수 있는 날입니다.",
    money: "예상치 못한 곳에서 작은 수입이 생길 수 있습니다. 하지만 충동적인 소비는 자제하세요.",
    health: "가벼운 스트레칭이나 산책으로 몸을 풀어주면 컨디션이 좋아집니다. 수분 섭취를 충분히 하세요.",
    luckyColor: "노란색",
    luckyNumber: 7,
    overallScore: 4,
    loveScore: 5,
    moneyScore: 3,
    healthScore: 4,
  },
  {
    overall: "차분하게 내면을 돌아보기 좋은 하루입니다. 급하게 결정을 내리기보다는 한 발 물러서서 상황을 관찰하면 더 좋은 결과를 얻을 수 있어요.",
    love: "상대방의 마음을 이해하려는 노력이 관계를 더 깊게 만들어줍니다. 진심 어린 대화를 나눠보세요.",
    money: "투자보다는 저축에 집중하는 것이 좋은 날입니다. 안정적인 재정 관리가 행운을 불러옵니다.",
    health: "충분한 수면이 오늘의 건강 포인트입니다. 일찍 잠자리에 드는 것을 추천합니다.",
    luckyColor: "파란색",
    luckyNumber: 3,
    overallScore: 3,
    loveScore: 4,
    moneyScore: 3,
    healthScore: 3,
  },
  {
    overall: "창의력이 폭발하는 날입니다! 예술적인 활동이나 새로운 취미를 시작하기에 최적의 타이밍이에요. 직감을 믿고 행동하면 좋은 결과가 따라옵니다.",
    love: "유머와 재치가 매력 포인트가 되는 날. 자연스럽게 웃음을 나누면 좋은 인연을 만날 수 있어요.",
    money: "부업이나 사이드 프로젝트에서 수익 기회가 보입니다. 작은 것부터 시작해보세요.",
    health: "에너지가 넘치지만 과로는 금물! 적당한 휴식과 활동의 밸런스를 유지하세요.",
    luckyColor: "주황색",
    luckyNumber: 9,
    overallScore: 5,
    loveScore: 4,
    moneyScore: 4,
    healthScore: 3,
  },
  {
    overall: "인간관계에서 좋은 소식이 들려오는 하루입니다. 오랜만에 연락이 뜸했던 친구에게 연락해보세요. 뜻밖의 기회가 찾아올 수 있습니다.",
    love: "따뜻한 한마디가 큰 감동을 줄 수 있는 날이에요. 감사한 마음을 표현해보세요.",
    money: "동료나 지인을 통해 좋은 정보를 얻을 수 있습니다. 네트워킹에 신경 쓰세요.",
    health: "스트레스가 쌓이지 않도록 가벼운 운동을 해주세요. 요가나 명상이 특히 좋습니다.",
    luckyColor: "초록색",
    luckyNumber: 5,
    overallScore: 4,
    loveScore: 5,
    moneyScore: 4,
    healthScore: 3,
  },
  {
    overall: "집중력이 높아지는 날입니다. 중요한 업무나 공부에 매진하면 큰 성과를 거둘 수 있어요. 계획을 세우고 하나씩 실행해 나가세요.",
    love: "진지한 대화가 관계를 한 단계 발전시킬 수 있습니다. 서로의 미래에 대해 이야기해보세요.",
    money: "꼼꼼한 가계부 정리가 도움이 됩니다. 불필요한 구독 서비스를 점검해보세요.",
    health: "눈의 피로에 주의하세요. 디지털 기기 사용 시간을 조절하고 틈틈이 먼 곳을 바라보세요.",
    luckyColor: "보라색",
    luckyNumber: 1,
    overallScore: 4,
    loveScore: 3,
    moneyScore: 4,
    healthScore: 4,
  },
  {
    overall: "변화의 바람이 부는 하루예요. 익숙한 루틴에서 벗어나 새로운 것을 시도해보세요. 작은 변화가 큰 전환점이 될 수 있습니다.",
    love: "새로운 사람과의 만남이 설레는 날. 열린 마음으로 다양한 사람들을 만나보세요.",
    money: "새로운 수입원을 탐색하기 좋은 시기입니다. 관심 있던 분야를 공부해보세요.",
    health: "야외 활동이 몸과 마음에 활력을 줍니다. 점심시간에 잠깐이라도 밖에 나가보세요.",
    luckyColor: "빨간색",
    luckyNumber: 8,
    overallScore: 4,
    loveScore: 4,
    moneyScore: 3,
    healthScore: 5,
  },
  {
    overall: "안정과 평화가 찾아오는 하루입니다. 가까운 사람들과 소소한 행복을 나누세요. 감사한 마음이 더 큰 행운을 불러옵니다.",
    love: "소소한 일상의 행복이 사랑을 더 단단하게 만듭니다. 함께 요리하거나 영화를 보는 시간을 가져보세요.",
    money: "안정적인 수입이 이어지는 시기입니다. 장기적인 저축 계획을 세워보세요.",
    health: "규칙적인 식사가 건강의 기본! 균형 잡힌 영양 섭취에 신경 쓰세요.",
    luckyColor: "분홍색",
    luckyNumber: 2,
    overallScore: 3,
    loveScore: 5,
    moneyScore: 4,
    healthScore: 4,
  },
  {
    overall: "리더십이 빛나는 날입니다. 팀 프로젝트나 그룹 활동에서 주도적인 역할을 맡으면 좋은 성과를 낼 수 있어요.",
    love: "자신감 있는 모습이 매력적으로 보이는 날. 적극적으로 다가가보세요.",
    money: "비즈니스 관련 미팅이나 협상에서 유리한 결과를 얻을 수 있습니다.",
    health: "어깨와 목 근육에 신경 쓰세요. 자세 교정과 마사지가 도움이 됩니다.",
    luckyColor: "금색",
    luckyNumber: 6,
    overallScore: 5,
    loveScore: 4,
    moneyScore: 5,
    healthScore: 3,
  },
  {
    overall: "배움의 기회가 가득한 하루입니다. 새로운 지식을 쌓거나 기술을 익히기에 좋은 날이에요. 호기심을 따라가 보세요.",
    love: "지적인 대화가 서로를 더 가까워지게 합니다. 함께 전시회나 강연에 가보는 건 어떨까요?",
    money: "자기 계발에 투자하는 것이 장기적으로 큰 수익을 가져다줄 거예요.",
    health: "두뇌 활동이 활발한 만큼 충분한 수분과 견과류 섭취가 좋습니다.",
    luckyColor: "하늘색",
    luckyNumber: 4,
    overallScore: 4,
    loveScore: 3,
    moneyScore: 3,
    healthScore: 4,
  },
  {
    overall: "직감이 예리해지는 날입니다. 중요한 결정을 내려야 한다면 머리보다 마음의 소리에 귀 기울여보세요. 뜻밖의 행운이 찾아올 수 있습니다.",
    love: "눈빛만으로도 통하는 순간이 있을 거예요. 비언어적 소통의 힘을 믿어보세요.",
    money: "직감적으로 좋다고 느껴지는 투자 기회를 놓치지 마세요. 단, 금액은 소액으로 시작하세요.",
    health: "명상이나 호흡 운동이 심신 안정에 도움이 됩니다. 잠들기 전 5분간 시도해보세요.",
    luckyColor: "은색",
    luckyNumber: 11,
    overallScore: 5,
    loveScore: 4,
    moneyScore: 4,
    healthScore: 5,
  },
  {
    overall: "실용적인 하루를 보내기 좋은 날이에요. 집안 정리나 밀린 서류 정리 등 그동안 미뤄뒀던 일들을 처리하면 마음이 한결 가벼워질 거예요.",
    love: "사소한 배려가 큰 감동을 주는 날. 상대방이 좋아하는 간식을 사다 주면 어떨까요?",
    money: "절약의 미덕이 빛나는 날입니다. 쿠폰이나 할인 행사를 잘 활용해보세요.",
    health: "소화 기능이 민감해질 수 있으니 자극적인 음식은 피하고 따뜻한 차를 마셔보세요.",
    luckyColor: "베이지색",
    luckyNumber: 10,
    overallScore: 3,
    loveScore: 4,
    moneyScore: 3,
    healthScore: 3,
  },
  {
    overall: "사교적인 에너지가 넘치는 하루! 모임이나 파티에 참석하면 즐거운 시간을 보낼 수 있어요. 새로운 인맥이 미래의 기회로 이어질 수 있습니다.",
    love: "밝고 긍정적인 에너지가 이성을 끌어당깁니다. 자연스럽게 웃으며 대화해보세요.",
    money: "사람들과의 교류에서 좋은 비즈니스 아이디어를 얻을 수 있어요.",
    health: "음주나 과식에 주의하세요. 즐거운 자리에서도 절제가 필요합니다.",
    luckyColor: "연두색",
    luckyNumber: 12,
    overallScore: 4,
    loveScore: 5,
    moneyScore: 4,
    healthScore: 2,
  },
  {
    overall: "끈기와 인내가 보상받는 하루입니다. 당장 결과가 나오지 않더라도 꾸준히 노력하면 좋은 성과가 따라옵니다. 포기하지 마세요!",
    love: "관계에서 인내심이 필요한 시기예요. 서로를 이해하려는 노력이 관계를 성장시킵니다.",
    money: "장기 투자의 가치를 되새기는 날. 조급해하지 말고 꾸준히 모아가세요.",
    health: "체력 관리에 신경 쓰세요. 규칙적인 운동 습관이 건강을 지켜줍니다.",
    luckyColor: "갈색",
    luckyNumber: 15,
    overallScore: 3,
    loveScore: 3,
    moneyScore: 3,
    healthScore: 4,
  },
  {
    overall: "행운이 가득한 하루! 평소에 잘 안 되던 일이 술술 풀릴 수 있어요. 적극적으로 행동하고 기회를 잡으세요.",
    love: "로맨틱한 순간이 찾아올 수 있는 날. 분위기 있는 장소에서의 데이트를 추천합니다.",
    money: "뜻밖의 보너스나 선물이 들어올 수 있습니다. 감사하는 마음을 잊지 마세요.",
    health: "전반적으로 컨디션이 좋은 날이에요. 이 기회에 좀 더 강도 높은 운동을 해보세요.",
    luckyColor: "민트색",
    luckyNumber: 7,
    overallScore: 5,
    loveScore: 5,
    moneyScore: 5,
    healthScore: 5,
  },
  {
    overall: "자기 성찰의 시간이 필요한 하루입니다. 바쁜 일상에서 잠시 멈추고 자신이 원하는 것이 무엇인지 생각해보세요.",
    love: "혼자만의 시간도 소중해요. 자신을 사랑하는 것이 좋은 관계의 시작입니다.",
    money: "소비 패턴을 되돌아보기 좋은 날. 정말 필요한 것과 원하는 것을 구분해보세요.",
    health: "마음의 건강도 중요합니다. 좋아하는 음악을 듣거나 일기를 써보세요.",
    luckyColor: "라벤더색",
    luckyNumber: 13,
    overallScore: 3,
    loveScore: 3,
    moneyScore: 3,
    healthScore: 4,
  },
  {
    overall: "협력의 힘이 빛나는 날입니다. 혼자 해결하기 어려운 일도 함께하면 쉽게 풀려요. 주변에 도움을 요청하는 것을 두려워하지 마세요.",
    love: "파트너와 함께 목표를 세우면 관계가 더 깊어집니다. 팀워크가 곧 사랑이에요.",
    money: "공동 투자나 협업 프로젝트에서 좋은 결과를 기대할 수 있어요.",
    health: "친구와 함께하는 운동이 효과 만점! 러닝 메이트를 구해보세요.",
    luckyColor: "청록색",
    luckyNumber: 22,
    overallScore: 4,
    loveScore: 4,
    moneyScore: 4,
    healthScore: 4,
  },
  {
    overall: "표현력이 풍부해지는 하루예요. 그동안 전하지 못했던 마음을 글이나 말로 표현해보세요. 당신의 진심이 상대방에게 전해질 거예요.",
    love: "사랑한다는 말 한마디가 모든 것을 바꿀 수 있어요. 용기를 내보세요.",
    money: "프레젠테이션이나 협상에서 설득력이 높아집니다. 중요한 제안을 해보세요.",
    health: "목과 기관지 관리에 신경 쓰세요. 따뜻한 물을 자주 마시는 것이 좋습니다.",
    luckyColor: "코럴색",
    luckyNumber: 17,
    overallScore: 4,
    loveScore: 5,
    moneyScore: 4,
    healthScore: 3,
  },
  {
    overall: "정리정돈의 날! 물리적인 공간뿐 아니라 머릿속도 정리해보세요. 깔끔하게 정돈된 환경이 새로운 영감을 줄 거예요.",
    love: "과거의 감정을 정리하고 새로운 시작을 준비하세요. 깨끗한 마음으로 다가가면 좋은 인연이 찾아옵니다.",
    money: "불필요한 물건을 정리하면서 중고 판매를 해보세요. 생각보다 좋은 수입이 될 수 있어요.",
    health: "디톡스가 필요한 날. 가벼운 식단과 충분한 물 섭취로 몸을 정화해보세요.",
    luckyColor: "흰색",
    luckyNumber: 0,
    overallScore: 3,
    loveScore: 3,
    moneyScore: 3,
    healthScore: 5,
  },
  {
    overall: "도전 정신이 불타오르는 하루! 평소 해보고 싶었지만 망설였던 일에 과감하게 도전해보세요. 원숭이띠 특유의 재치가 빛을 발할 거예요.",
    love: "적극적인 어필이 효과적인 날. 수줍어하지 말고 다가가보세요.",
    money: "새로운 사업 아이디어가 떠오를 수 있어요. 메모해두면 나중에 큰 도움이 됩니다.",
    health: "새로운 스포츠를 시작해보기 좋은 날. 클라이밍이나 수영 같은 활동을 추천합니다.",
    luckyColor: "오렌지색",
    luckyNumber: 19,
    overallScore: 5,
    loveScore: 4,
    moneyScore: 4,
    healthScore: 4,
  },
  {
    overall: "감성이 풍부해지는 하루입니다. 음악, 영화, 책 등 예술 작품에서 큰 영감을 받을 수 있어요. 감정에 솔직해지세요.",
    love: "감성적인 분위기가 사랑을 더 깊게 만듭니다. 손편지를 써보는 건 어떨까요?",
    money: "감정적인 소비에 주의하세요. 기분이 좋을 때 지갑을 열기 쉬우니 한 번 더 생각하세요.",
    health: "감정 기복이 있을 수 있으니 충분한 휴식을 취하세요. 아로마 테라피가 도움이 됩니다.",
    luckyColor: "와인색",
    luckyNumber: 14,
    overallScore: 3,
    loveScore: 5,
    moneyScore: 2,
    healthScore: 3,
  },
  {
    overall: "행동력이 높아지는 하루! 계획만 세우지 말고 바로 실행에 옮기세요. 빠른 실행이 성공의 열쇠입니다.",
    love: "행동으로 보여주는 사랑이 감동을 줍니다. 말보다 실천이 중요한 날이에요.",
    money: "미뤄뒀던 금융 상품 가입이나 보험 점검을 해보세요. 오늘 시작하면 좋은 조건을 얻을 수 있어요.",
    health: "활동적인 에너지를 잘 활용하세요. 러닝이나 사이클링이 특히 좋습니다.",
    luckyColor: "네이비",
    luckyNumber: 21,
    overallScore: 4,
    loveScore: 4,
    moneyScore: 4,
    healthScore: 5,
  },
];

function getDateSeed(): number {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = kst.getUTCMonth() + 1;
  const day = kst.getUTCDate();
  return year * 10000 + month * 100 + day;
}

export function getTodayFortune(): ZodiacFortune {
  const seed = getDateSeed();
  const index = seed % MONKEY_FORTUNES.length;
  return MONKEY_FORTUNES[index];
}

export function getTodayDateKST(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
