import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { zodiacFortunes } from "./schema";
import { sql } from "drizzle-orm";

const client = neon(process.env.DATABASE_URL!);
const db = drizzle(client);

// ─── Seeded PRNG (mulberry32) ───
function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickScore(rng: () => number, bias: number = 0): number {
  // 가중치: 3점(35%), 4점(40%), 5점(25%) + bias
  const weights = [35, 40, 25];
  const biasedWeights = weights.map((w, i) => Math.max(1, w + (i - 1) * bias));
  const total = biasedWeights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < biasedWeights.length; i++) {
    r -= biasedWeights[i];
    if (r <= 0) return i + 3;
  }
  return 3;
}

// ─── 계절 판별 ───
function getSeason(day: number): "spring" | "summer" | "autumn" | "winter" {
  if (day >= 60 && day < 152) return "spring";
  if (day >= 152 && day < 244) return "summer";
  if (day >= 244 && day < 335) return "autumn";
  return "winter";
}

// ─── 12개 띠 프로필 ───
interface ZodiacProfile {
  key: string;
  label: string;
  traits: string[];
  strengths: string[];
  weaknesses: string[];
  luckyActivities: string[];
  scoreBias: number; // -2 ~ 2
}

const ZODIAC_PROFILES: ZodiacProfile[] = [
  {
    key: "rat", label: "쥐띠",
    traits: ["지혜로운", "재치 있는", "적응력 강한", "눈치 빠른"],
    strengths: ["빠른 판단력", "사교성", "기민한 대처"],
    weaknesses: ["걱정이 많은 편", "소심해질 때"],
    luckyActivities: ["독서", "퍼즐 풀기", "새로운 정보 탐색", "재테크 공부"],
    scoreBias: 1,
  },
  {
    key: "ox", label: "소띠",
    traits: ["성실한", "인내심 강한", "책임감 있는", "묵묵한"],
    strengths: ["꾸준한 노력", "신뢰감", "뚝심"],
    weaknesses: ["융통성이 부족할 때", "고집이 셀 때"],
    luckyActivities: ["정원 가꾸기", "요리", "등산", "저축 계획 세우기"],
    scoreBias: 0,
  },
  {
    key: "tiger", label: "호랑이띠",
    traits: ["용감한", "카리스마 있는", "정의로운", "열정적인"],
    strengths: ["리더십", "결단력", "추진력"],
    weaknesses: ["성급할 때", "독단적일 때"],
    luckyActivities: ["운동", "모험", "새로운 도전", "리더 역할"],
    scoreBias: 1,
  },
  {
    key: "rabbit", label: "토끼띠",
    traits: ["온화한", "섬세한", "예술적인", "평화로운"],
    strengths: ["공감 능력", "섬세한 감각", "조화로운 관계"],
    weaknesses: ["우유부단할 때", "소극적일 때"],
    luckyActivities: ["그림 그리기", "음악 감상", "카페 방문", "편지 쓰기"],
    scoreBias: 0,
  },
  {
    key: "dragon", label: "용띠",
    traits: ["야심찬", "열정적인", "당당한", "매력적인"],
    strengths: ["강한 의지", "창의력", "존재감"],
    weaknesses: ["완벽주의", "자존심이 강할 때"],
    luckyActivities: ["프레젠테이션", "창작 활동", "네트워킹", "자기 PR"],
    scoreBias: 2,
  },
  {
    key: "snake", label: "뱀띠",
    traits: ["통찰력 있는", "신비로운", "지적인", "차분한"],
    strengths: ["분석력", "직관력", "전략적 사고"],
    weaknesses: ["의심이 많을 때", "비밀이 많을 때"],
    luckyActivities: ["명상", "전략 게임", "심리학 공부", "와인 감상"],
    scoreBias: 0,
  },
  {
    key: "horse", label: "말띠",
    traits: ["자유로운", "활동적인", "낙관적인", "에너지 넘치는"],
    strengths: ["행동력", "사교성", "모험 정신"],
    weaknesses: ["산만해질 때", "끈기가 부족할 때"],
    luckyActivities: ["여행", "달리기", "새로운 장소 탐험", "페스티벌"],
    scoreBias: 1,
  },
  {
    key: "sheep", label: "양띠",
    traits: ["창의적인", "예술적인", "다정한", "감성적인"],
    strengths: ["예술적 감각", "배려심", "상상력"],
    weaknesses: ["감정 기복", "걱정이 많을 때"],
    luckyActivities: ["공예", "미술관 방문", "요리", "일기 쓰기"],
    scoreBias: -1,
  },
  {
    key: "monkey", label: "원숭이띠",
    traits: ["영리한", "재치 넘치는", "호기심 많은", "유머러스한"],
    strengths: ["문제 해결 능력", "유연한 사고", "재미"],
    weaknesses: ["장난이 심할 때", "집중력이 흐트러질 때"],
    luckyActivities: ["새로운 기술 배우기", "코미디 감상", "보드게임", "SNS 활동"],
    scoreBias: 1,
  },
  {
    key: "rooster", label: "닭띠",
    traits: ["부지런한", "꼼꼼한", "자신감 있는", "솔직한"],
    strengths: ["계획성", "정확함", "성실함"],
    weaknesses: ["완벽주의", "비판적일 때"],
    luckyActivities: ["스케줄 정리", "패션 쇼핑", "일기 쓰기", "정리정돈"],
    scoreBias: 0,
  },
  {
    key: "dog", label: "개띠",
    traits: ["충직한", "정의로운", "따뜻한", "헌신적인"],
    strengths: ["의리", "보호 본능", "진실됨"],
    weaknesses: ["걱정이 많을 때", "완고할 때"],
    luckyActivities: ["봉사활동", "친구 만나기", "산책", "반려동물 돌보기"],
    scoreBias: 0,
  },
  {
    key: "pig", label: "돼지띠",
    traits: ["낙천적인", "관대한", "순수한", "복이 많은"],
    strengths: ["긍정 에너지", "너그러움", "행운"],
    weaknesses: ["나이브할 때", "과소비 경향"],
    luckyActivities: ["맛집 탐방", "쇼핑", "파티", "기부"],
    scoreBias: 1,
  },
];

// ─── 총운 템플릿 ───
const OVERALL_TEMPLATES = [
  (p: ZodiacProfile, s: string) => `${pick(p.traits, () => 0.5)} ${p.label}에게 활기찬 에너지가 넘치는 하루입니다. 새로운 도전을 시작하기에 좋은 날이니, 미루던 일이 있다면 오늘 시작해보세요.`,
  (p: ZodiacProfile, s: string) => `오늘은 ${p.label}의 ${pick(p.strengths, () => 0.5)}이(가) 빛을 발하는 날입니다. 주변 사람들이 당신의 능력을 인정하게 될 거예요.`,
  (p: ZodiacProfile, s: string) => `차분하게 내면을 돌아보기 좋은 하루입니다. 급하게 결정을 내리기보다는 한 발 물러서서 상황을 관찰하면 더 좋은 결과를 얻을 수 있어요.`,
  (p: ZodiacProfile, s: string) => `${p.label}의 직감이 유독 예리해지는 날입니다. 중요한 결정이 있다면 마음의 소리에 귀 기울여보세요. 뜻밖의 행운이 찾아올 수 있습니다.`,
  (p: ZodiacProfile, s: string) => `인간관계에서 좋은 소식이 들려오는 하루입니다. 오래 연락하지 못했던 사람에게 먼저 연락해보세요. 뜻밖의 기회가 찾아올 수 있어요.`,
  (p: ZodiacProfile, s: string) => `창의력이 폭발하는 날! ${pick(p.luckyActivities, () => 0.5)}을(를) 해보세요. ${p.label} 특유의 감각이 빛을 발할 거예요.`,
  (p: ZodiacProfile, s: string) => `오늘은 ${p.label}에게 배움의 기회가 가득한 하루입니다. 새로운 지식을 쌓거나 기술을 익히기에 최적의 타이밍이에요.`,
  (p: ZodiacProfile, s: string) => `집중력이 높아지는 날입니다. 중요한 업무나 과제에 매진하면 큰 성과를 거둘 수 있어요. 계획을 세우고 하나씩 실행해 나가세요.`,
  (p: ZodiacProfile, s: string) => `변화의 바람이 부는 하루예요. 익숙한 루틴에서 벗어나 새로운 것을 시도해보세요. 작은 변화가 큰 전환점이 될 수 있습니다.`,
  (p: ZodiacProfile, s: string) => `안정과 평화가 찾아오는 하루입니다. 가까운 사람들과 소소한 행복을 나누세요. 감사한 마음이 더 큰 행운을 불러옵니다.`,
  (p: ZodiacProfile, s: string) => `리더십이 빛나는 날! ${p.label}의 ${pick(p.strengths, () => 0.3)}을(를) 발휘할 때입니다. 주도적으로 나서면 좋은 결과를 얻을 수 있어요.`,
  (p: ZodiacProfile, s: string) => `사교적인 에너지가 넘치는 하루! 모임이나 만남에서 즐거운 시간을 보낼 수 있어요. 새로운 인맥이 미래의 기회가 될 수 있습니다.`,
  (p: ZodiacProfile, s: string) => `끈기와 인내가 보상받는 하루입니다. 당장 결과가 나오지 않더라도 꾸준히 노력하면 좋은 성과가 따라옵니다.`,
  (p: ZodiacProfile, s: string) => `행운이 가득한 하루! 평소에 잘 안 되던 일이 술술 풀릴 수 있어요. 적극적으로 행동하고 기회를 잡으세요.`,
  (p: ZodiacProfile, s: string) => `자기 성찰의 시간이 필요한 하루입니다. 바쁜 일상에서 잠시 멈추고 자신이 정말 원하는 것이 무엇인지 생각해보세요.`,
  (p: ZodiacProfile, s: string) => `협력의 힘이 빛나는 날입니다. 혼자 해결하기 어려운 일도 함께하면 쉽게 풀려요. 주변에 도움을 요청하는 것을 두려워하지 마세요.`,
  (p: ZodiacProfile, s: string) => `표현력이 풍부해지는 하루예요. 그동안 전하지 못했던 마음을 글이나 말로 표현해보세요. 진심이 전해질 거예요.`,
  (p: ZodiacProfile, s: string) => `정리정돈의 날! 물리적 공간뿐 아니라 머릿속도 정리해보세요. 깔끔하게 정돈된 환경이 새로운 영감을 줄 거예요.`,
  (p: ZodiacProfile, s: string) => `도전 정신이 불타오르는 하루! 평소 해보고 싶었지만 망설였던 일에 과감하게 도전해보세요. ${p.label} 특유의 ${pick(p.traits, () => 0.7)} 매력이 빛날 거예요.`,
  (p: ZodiacProfile, s: string) => `감성이 풍부해지는 하루입니다. 음악, 영화, 책 등 예술 작품에서 큰 영감을 받을 수 있어요.`,
  (p: ZodiacProfile, s: string) => `행동력이 높아지는 하루! 계획만 세우지 말고 바로 실행에 옮기세요. 빠른 실행이 성공의 열쇠입니다.`,
  (p: ZodiacProfile, s: string) => `오늘은 ${p.label}에게 한 단계 성장할 수 있는 기회가 옵니다. 실수를 두려워하지 말고 경험에서 배우세요.`,
  (p: ZodiacProfile, s: string) => `주변 사람들에게 긍정적인 영향을 미치는 날입니다. 당신의 ${pick(p.traits, () => 0.2)} 성격이 모두에게 좋은 에너지를 전해줄 거예요.`,
  (p: ZodiacProfile, s: string) => `오늘은 새로운 습관을 시작하기에 좋은 날이에요. 작은 것부터 시작해보세요. ${pick(p.luckyActivities, () => 0.8)}은(는) 어떨까요?`,
  (p: ZodiacProfile, s: string) => `운명적인 만남이 기다리고 있을 수 있는 하루입니다. 열린 마음으로 하루를 보내보세요.`,
  (p: ZodiacProfile, s: string) => `오늘은 ${p.label}에게 소확행(소소하지만 확실한 행복)이 찾아오는 날이에요. 작은 것에서 행복을 발견해보세요.`,
  (p: ZodiacProfile, s: string) => `머리가 맑아지는 날이에요. 복잡한 문제도 명쾌하게 해결할 수 있는 통찰력이 생깁니다. 중요한 의사결정은 오늘 하세요!`,
  (p: ZodiacProfile, s: string) => `오늘은 과거를 정리하고 새 출발을 준비하기 좋은 날입니다. 불필요한 것들을 내려놓으면 마음이 한결 가벼워질 거예요.`,
  (p: ZodiacProfile, s: string) => `${p.label}의 숨겨진 재능이 빛을 발하는 날! 평소 자신 없었던 분야에서도 의외의 성과를 거둘 수 있어요.`,
  (p: ZodiacProfile, s: string) => `오늘은 계획보다 즉흥이 더 좋은 결과를 가져다주는 날이에요. 딱딱한 스케줄을 잠시 내려놓고 흐름에 맡겨보세요.`,
  (p: ZodiacProfile, s: string) => `주변의 조언에 귀를 기울여보세요. 생각지 못한 시각에서 해결의 실마리를 발견할 수 있습니다.`,
  (p: ZodiacProfile, s: string) => `오늘은 이전에 실패했던 일에 다시 도전하면 좋은 결과를 얻을 수 있는 날이에요. 과거는 교훈일 뿐, 미래를 결정하지 않아요.`,
  (p: ZodiacProfile, s: string) => `마음의 여유가 필요한 하루입니다. 모든 것을 완벽하게 해내려 하지 마세요. 오늘은 80%만 해도 충분히 잘하고 있는 거예요.`,
  (p: ZodiacProfile, s: string) => `예상치 못한 기회가 찾아오는 날! 항상 준비된 ${p.label}이라면 이 기회를 놓치지 않을 거예요.`,
  (p: ZodiacProfile, s: string) => `오늘은 팀워크가 빛나는 날입니다. 함께하는 사람들과 시너지를 내면 혼자서는 불가능했던 일도 해낼 수 있어요.`,
  (p: ZodiacProfile, s: string) => `긍정적인 마인드가 현실을 바꾸는 날입니다. 어려운 상황에서도 밝은 면을 찾으면 길이 보일 거예요.`,
  (p: ZodiacProfile, s: string) => `오늘 하루는 천천히, 여유롭게 보내보세요. 서두르지 않아도 됩니다. 느긋한 하루가 오히려 더 많은 것을 가져다줄 거예요.`,
  (p: ZodiacProfile, s: string) => `자신만의 원칙을 세우기 좋은 날입니다. 흔들리지 않는 기준이 있으면 어떤 상황에서도 현명한 선택을 할 수 있어요.`,
  (p: ZodiacProfile, s: string) => `오늘은 "감사합니다"라는 말의 힘이 특별한 날이에요. 주변 사람들에게 감사를 표현하면 예상치 못한 행운이 돌아올 거예요.`,
  (p: ZodiacProfile, s: string) => `${p.label}에게 잠시 쉬어가는 것도 전략입니다. 무작정 달리기보다 잠시 멈추고 방향을 점검하세요.`,
  (p: ZodiacProfile, s: string) => `오늘은 작은 성공을 축하하는 날로 만들어보세요. 당연하게 여겼던 성취를 인정하면 자신감이 높아집니다.`,
  (p: ZodiacProfile, s: string) => `평소와 다른 시각으로 세상을 바라보면 새로운 발견이 있을 거예요. ${p.label}의 ${pick(p.strengths, () => 0.6)}이(가) 빛나는 순간입니다.`,
  (p: ZodiacProfile, s: string) => `오늘의 키워드는 '집중'입니다. 여러 가지를 동시에 하기보다 하나에 올인하면 놀라운 결과를 만들 수 있어요.`,
  (p: ZodiacProfile, s: string) => `누군가에게 도움을 줄 수 있는 날이에요. 작은 친절이 나비효과처럼 큰 행운으로 돌아올 수 있습니다.`,
  (p: ZodiacProfile, s: string) => `오늘은 과감한 결정이 필요한 날입니다. 망설이면 기회가 지나갈 수 있어요. ${p.label}의 결단력을 믿어보세요.`,
  (p: ZodiacProfile, s: string) => `유연한 사고가 필요한 하루예요. 고정관념을 버리고 새로운 방식으로 접근해보세요. 의외의 해결책을 발견할 수 있습니다.`,
  (p: ZodiacProfile, s: string) => `오늘은 혼자만의 시간이 금이에요. 조용한 공간에서 자신과 대화하는 시간을 가져보세요. 중요한 깨달음이 찾아올 수 있어요.`,
  (p: ZodiacProfile, s: string) => `주변 환경을 바꾸면 기분도 바뀌는 날! 책상 배치를 바꾸거나 새로운 카페에서 일해보세요.`,
  (p: ZodiacProfile, s: string) => `오늘은 배운 것을 나누면 더 큰 지혜가 돌아오는 날이에요. 후배나 동료에게 노하우를 전수해보세요.`,
  (p: ZodiacProfile, s: string) => `작은 약속이라도 지키는 것이 신뢰를 쌓는 날입니다. ${p.label}의 ${pick(p.traits, () => 0.4)} 성품이 빛나는 하루가 될 거예요.`,
  (p: ZodiacProfile, s: string) => `오늘은 무엇이든 시작하면 반은 성공한 겁니다! 완벽하지 않아도 괜찮아요. 일단 시작해보세요.`,
  (p: ZodiacProfile, s: string) => `미래를 위한 씨앗을 뿌리기 좋은 날이에요. 지금 하는 작은 노력이 몇 달 후 큰 열매로 돌아올 거예요.`,
  (p: ZodiacProfile, s: string) => `오늘은 자기 자신을 칭찬해주는 날로 정해보세요. 당신은 이미 충분히 잘하고 있어요, ${p.label}!`,
  (p: ZodiacProfile, s: string) => `놀라운 아이디어가 떠오르는 날! 메모장을 가까이 두세요. 번뜩이는 영감을 놓치지 마세요.`,
  (p: ZodiacProfile, s: string) => `오늘은 '왜?'라는 질문이 행운을 불러오는 날이에요. 당연하게 여겼던 것들에 의문을 가져보세요.`,
  (p: ZodiacProfile, s: string) => `웃음이 최고의 약이 되는 하루예요. 재미있는 영상이나 유머를 찾아보세요. 마음이 한결 가벼워질 거예요.`,
  (p: ZodiacProfile, s: string) => `오늘 만나는 모든 사람이 선생님이에요. 누구에게서든 배울 점을 찾으면 ${p.label}의 하루가 더 풍요로워질 거예요.`,
  (p: ZodiacProfile, s: string) => `오늘은 디테일에 신경 쓰면 큰 차이를 만들 수 있는 날이에요. 사소한 것도 놓치지 마세요.`,
  (p: ZodiacProfile, s: string) => `오래 고민했던 문제의 답이 의외로 가까운 곳에 있을 수 있어요. 너무 멀리서 찾지 마세요.`,
  (p: ZodiacProfile, s: string) => `${p.label}에게 새 바람이 불어오는 날이에요. 변화를 두려워하지 말고 환영하세요. 더 나은 내일이 기다리고 있어요.`,
];

// ─── 계절별 총운 보너스 ───
const SEASONAL_OVERALL: Record<string, string[]> = {
  spring: [
    "봄바람과 함께 새로운 시작의 에너지가 가득합니다.",
    "벚꽃처럼 아름다운 기회가 피어나는 시기예요.",
    "따스한 봄 햇살처럼 마음이 따뜻해지는 하루입니다.",
    "새싹이 돋아나듯 당신의 가능성도 자라나고 있어요.",
    "봄의 생기를 담아 활기찬 하루를 보내세요.",
  ],
  summer: [
    "뜨거운 열정으로 무엇이든 해낼 수 있는 에너지가 넘칩니다!",
    "여름의 태양처럼 당신의 존재감이 빛나는 날이에요.",
    "시원한 바다처럼 마음을 열고 새로운 것을 받아들여보세요.",
    "더위를 이겨낼 만큼 강한 의지가 생기는 하루입니다.",
    "여름밤의 별처럼 빛나는 아이디어가 떠오를 거예요.",
  ],
  autumn: [
    "풍요로운 가을처럼 그동안의 노력이 결실을 맺는 시기입니다.",
    "단풍처럼 아름다운 변화가 찾아오는 날이에요.",
    "선선한 가을 바람과 함께 마음의 여유가 생기는 하루입니다.",
    "독서의 계절답게, 새로운 지식을 쌓기 좋은 때예요.",
    "수확의 기쁨을 누릴 수 있는 감사한 하루입니다.",
  ],
  winter: [
    "겨울의 고요함 속에서 내면의 지혜가 빛나는 날입니다.",
    "따뜻한 차 한잔처럼 마음이 포근해지는 하루예요.",
    "눈 내리는 겨울처럼 새하얀 시작을 준비하기 좋은 때입니다.",
    "추운 날씨지만 마음만은 따뜻한 하루가 될 거예요.",
    "겨울이 지나면 봄이 오듯, 어려움 뒤에 좋은 일이 기다리고 있어요.",
  ],
};

// ─── 애정운 템플릿 ───
const LOVE_TEMPLATES = [
  (p: ZodiacProfile) => `연인과 함께하는 시간이 특별하게 느껴질 거예요. 솔로라면 우연한 만남에서 설렘을 느낄 수 있는 날입니다.`,
  (p: ZodiacProfile) => `상대방의 마음을 이해하려는 노력이 관계를 더 깊게 만들어줍니다. 진심 어린 대화를 나눠보세요.`,
  (p: ZodiacProfile) => `유머와 재치가 매력 포인트가 되는 날. 자연스럽게 웃음을 나누면 좋은 인연을 만날 수 있어요.`,
  (p: ZodiacProfile) => `따뜻한 한마디가 큰 감동을 줄 수 있는 날이에요. 감사한 마음을 표현해보세요.`,
  (p: ZodiacProfile) => `진지한 대화가 관계를 한 단계 발전시킬 수 있습니다. 서로의 미래에 대해 이야기해보세요.`,
  (p: ZodiacProfile) => `새로운 사람과의 만남이 설레는 날. 열린 마음으로 다양한 사람들을 만나보세요.`,
  (p: ZodiacProfile) => `소소한 일상의 행복이 사랑을 더 단단하게 만듭니다. 함께 요리하거나 영화를 보는 시간을 가져보세요.`,
  (p: ZodiacProfile) => `자신감 있는 모습이 매력적으로 보이는 날. ${p.label} 특유의 ${pick(p.traits, () => 0.3)} 매력을 발산해보세요.`,
  (p: ZodiacProfile) => `지적인 대화가 서로를 더 가까워지게 합니다. 함께 전시회나 강연에 가보는 건 어떨까요?`,
  (p: ZodiacProfile) => `눈빛만으로도 통하는 순간이 있을 거예요. 비언어적 소통의 힘을 믿어보세요.`,
  (p: ZodiacProfile) => `사소한 배려가 큰 감동을 주는 날. 상대방이 좋아하는 것을 준비하면 어떨까요?`,
  (p: ZodiacProfile) => `밝고 긍정적인 에너지가 이성을 끌어당깁니다. 자연스럽게 웃으며 대화해보세요.`,
  (p: ZodiacProfile) => `관계에서 인내심이 필요한 시기예요. 서로를 이해하려는 노력이 관계를 성장시킵니다.`,
  (p: ZodiacProfile) => `로맨틱한 순간이 찾아올 수 있는 날. 분위기 있는 장소에서의 만남을 추천합니다.`,
  (p: ZodiacProfile) => `혼자만의 시간도 소중해요. 자신을 사랑하는 것이 좋은 관계의 시작입니다.`,
  (p: ZodiacProfile) => `파트너와 함께 새로운 경험을 하면 관계가 더 깊어집니다. 함께 도전해보세요.`,
  (p: ZodiacProfile) => `사랑한다는 말 한마디가 모든 것을 바꿀 수 있어요. 용기를 내보세요.`,
  (p: ZodiacProfile) => `과거의 감정을 정리하고 새로운 시작을 준비하세요. 깨끗한 마음으로 다가가면 좋은 인연이 찾아옵니다.`,
  (p: ZodiacProfile) => `적극적인 어필이 효과적인 날. 수줍어하지 말고 먼저 다가가보세요.`,
  (p: ZodiacProfile) => `감성적인 분위기가 사랑을 더 깊게 만듭니다. 손편지를 써보는 건 어떨까요?`,
  (p: ZodiacProfile) => `행동으로 보여주는 사랑이 감동을 줍니다. 말보다 실천이 중요한 날이에요.`,
  (p: ZodiacProfile) => `오늘은 첫인상이 특히 중요한 날! 외모에 조금 더 신경 쓰면 좋은 결과가 있을 거예요.`,
  (p: ZodiacProfile) => `상대방의 장점에 집중하면 관계가 더 좋아지는 날이에요. 칭찬은 고래도 춤추게 하잖아요!`,
  (p: ZodiacProfile) => `예기치 않은 곳에서 인연이 찾아올 수 있어요. 마트, 카페, 엘리베이터... 어디서든 열린 마음을 유지하세요.`,
  (p: ZodiacProfile) => `오늘은 상대방의 이야기에 깊이 공감하면 관계가 한 단계 발전합니다. 경청의 힘을 발휘해보세요.`,
  (p: ZodiacProfile) => `함께하는 추억을 만들기 좋은 날이에요. 사진을 찍거나 특별한 장소를 방문해보세요.`,
  (p: ZodiacProfile) => `때로는 거리감이 관계를 더 건강하게 만들어요. 각자의 시간을 존중하는 것도 사랑이에요.`,
  (p: ZodiacProfile) => `솔직한 감정 표현이 매력적으로 보이는 날! 가식 없이 진심을 전해보세요.`,
  (p: ZodiacProfile) => `오늘은 작은 선물이 큰 감동을 주는 날이에요. 값비싼 것이 아니어도 진심이 담기면 충분해요.`,
  (p: ZodiacProfile) => `오랫동안 연락하지 못한 소중한 사람에게 연락해보세요. 반가운 재회가 될 수 있어요.`,
  (p: ZodiacProfile) => `갈등이 있다면 먼저 손을 내밀어보세요. ${p.label}의 따뜻한 마음이 관계를 회복시킬 거예요.`,
  (p: ZodiacProfile) => `오늘의 사랑 키워드는 '인내'예요. 조급해하지 않으면 더 좋은 결과가 기다리고 있어요.`,
  (p: ZodiacProfile) => `연인에게 깜짝 이벤트를 준비하면 최고의 반응을 얻을 수 있는 날이에요!`,
  (p: ZodiacProfile) => `오늘은 말보다 눈빛으로 전하는 마음이 더 깊이 와닿는 날이에요.`,
  (p: ZodiacProfile) => `자기 자신을 먼저 사랑해야 다른 사람도 사랑할 수 있어요. 오늘은 나를 위한 시간을 가져보세요.`,
];

// ─── 금전운 템플릿 ───
const MONEY_TEMPLATES = [
  (p: ZodiacProfile) => `예상치 못한 곳에서 작은 수입이 생길 수 있습니다. 하지만 충동적인 소비는 자제하세요.`,
  (p: ZodiacProfile) => `투자보다는 저축에 집중하는 것이 좋은 날입니다. 안정적인 재정 관리가 행운을 불러옵니다.`,
  (p: ZodiacProfile) => `부업이나 사이드 프로젝트에서 수익 기회가 보입니다. 작은 것부터 시작해보세요.`,
  (p: ZodiacProfile) => `동료나 지인을 통해 좋은 정보를 얻을 수 있습니다. 네트워킹에 신경 쓰세요.`,
  (p: ZodiacProfile) => `꼼꼼한 가계부 정리가 도움이 됩니다. 불필요한 구독 서비스를 점검해보세요.`,
  (p: ZodiacProfile) => `새로운 수입원을 탐색하기 좋은 시기입니다. 관심 있던 분야를 공부해보세요.`,
  (p: ZodiacProfile) => `안정적인 수입이 이어지는 시기입니다. 장기적인 저축 계획을 세워보세요.`,
  (p: ZodiacProfile) => `비즈니스 관련 미팅이나 협상에서 유리한 결과를 얻을 수 있습니다.`,
  (p: ZodiacProfile) => `자기 계발에 투자하는 것이 장기적으로 큰 수익을 가져다줄 거예요.`,
  (p: ZodiacProfile) => `직감적으로 좋다고 느껴지는 기회를 놓치지 마세요. 단, 무리한 투자는 금물!`,
  (p: ZodiacProfile) => `절약의 미덕이 빛나는 날입니다. 쿠폰이나 할인 행사를 잘 활용해보세요.`,
  (p: ZodiacProfile) => `사람들과의 교류에서 좋은 비즈니스 아이디어를 얻을 수 있어요.`,
  (p: ZodiacProfile) => `장기 투자의 가치를 되새기는 날. 조급해하지 말고 꾸준히 모아가세요.`,
  (p: ZodiacProfile) => `뜻밖의 보너스나 선물이 들어올 수 있습니다. 감사하는 마음을 잊지 마세요.`,
  (p: ZodiacProfile) => `소비 패턴을 되돌아보기 좋은 날. 정말 필요한 것과 원하는 것을 구분해보세요.`,
  (p: ZodiacProfile) => `공동 투자나 협업 프로젝트에서 좋은 결과를 기대할 수 있어요.`,
  (p: ZodiacProfile) => `프레젠테이션이나 협상에서 설득력이 높아집니다. 중요한 제안을 해보세요.`,
  (p: ZodiacProfile) => `불필요한 물건을 정리하면서 중고 판매를 해보세요. 생각보다 좋은 수입이 될 수 있어요.`,
  (p: ZodiacProfile) => `새로운 사업 아이디어가 떠오를 수 있어요. 메모해두면 나중에 큰 도움이 됩니다.`,
  (p: ZodiacProfile) => `미뤄뒀던 금융 상품 가입이나 보험 점검을 해보세요. 오늘 시작하면 좋은 조건을 얻을 수 있어요.`,
  (p: ZodiacProfile) => `감정적인 소비에 주의하세요. 기분이 좋을 때 지갑을 열기 쉬우니 한 번 더 생각하세요.`,
  (p: ZodiacProfile) => `오늘은 돈보다 시간에 투자하는 것이 더 큰 가치를 가져다주는 날이에요.`,
  (p: ZodiacProfile) => `재정 상태를 점검하기 좋은 날이에요. 수입과 지출의 균형을 체크해보세요.`,
  (p: ZodiacProfile) => `${p.label}의 꼼꼼함이 재테크에서 빛을 발하는 날! 세부 사항을 놓치지 마세요.`,
  (p: ZodiacProfile) => `의외의 곳에서 할인 혜택을 발견할 수 있어요. 이것저것 비교해보세요.`,
  (p: ZodiacProfile) => `오늘은 큰 지출을 삼가고, 작은 절약을 실천해보세요. 티끌 모아 태산이에요!`,
  (p: ZodiacProfile) => `동전도 무시하지 마세요. 작은 금액이라도 모이면 큰 힘이 됩니다.`,
  (p: ZodiacProfile) => `중고거래나 리셀 시장에서 좋은 기회가 있을 수 있어요. 눈여겨보세요.`,
  (p: ZodiacProfile) => `오늘은 쇼핑리스트를 미리 작성하고 나가세요. 계획 없는 소비가 가장 위험해요.`,
  (p: ZodiacProfile) => `자격증이나 기술 습득에 투자하면 미래에 큰 수익으로 돌아올 거예요.`,
  (p: ZodiacProfile) => `친구에게 빌려준 돈이 돌아올 수 있는 날이에요. 하지만 독촉보다는 자연스럽게 기다려보세요.`,
  (p: ZodiacProfile) => `오늘의 금전 키워드는 '절제'입니다. 있는 것에 감사하고, 필요한 것만 소비하세요.`,
  (p: ZodiacProfile) => `창의적인 아이디어가 수익으로 이어질 수 있어요. 메모해두세요!`,
  (p: ZodiacProfile) => `복권이나 경품 행사에 당첨될 수 있는 작은 운이 있어요. 가볍게 도전해보세요.`,
  (p: ZodiacProfile) => `오늘은 남에게 베풀면 두 배로 돌아오는 날이에요. 작은 기부도 좋습니다.`,
];

// ─── 건강운 템플릿 ───
const HEALTH_TEMPLATES = [
  (p: ZodiacProfile) => `가벼운 스트레칭이나 산책으로 몸을 풀어주면 컨디션이 좋아집니다. 수분 섭취를 충분히 하세요.`,
  (p: ZodiacProfile) => `충분한 수면이 오늘의 건강 포인트입니다. 일찍 잠자리에 드는 것을 추천합니다.`,
  (p: ZodiacProfile) => `에너지가 넘치지만 과로는 금물! 적당한 휴식과 활동의 밸런스를 유지하세요.`,
  (p: ZodiacProfile) => `스트레스가 쌓이지 않도록 가벼운 운동을 해주세요. 요가나 명상이 특히 좋습니다.`,
  (p: ZodiacProfile) => `눈의 피로에 주의하세요. 디지털 기기 사용 시간을 조절하고 틈틈이 먼 곳을 바라보세요.`,
  (p: ZodiacProfile) => `야외 활동이 몸과 마음에 활력을 줍니다. 점심시간에 잠깐이라도 밖에 나가보세요.`,
  (p: ZodiacProfile) => `규칙적인 식사가 건강의 기본! 균형 잡힌 영양 섭취에 신경 쓰세요.`,
  (p: ZodiacProfile) => `어깨와 목 근육에 신경 쓰세요. 자세 교정과 마사지가 도움이 됩니다.`,
  (p: ZodiacProfile) => `두뇌 활동이 활발한 만큼 충분한 수분과 견과류 섭취가 좋습니다.`,
  (p: ZodiacProfile) => `명상이나 호흡 운동이 심신 안정에 도움이 됩니다. 잠들기 전 5분간 시도해보세요.`,
  (p: ZodiacProfile) => `소화 기능이 민감해질 수 있으니 자극적인 음식은 피하고 따뜻한 차를 마셔보세요.`,
  (p: ZodiacProfile) => `음주나 과식에 주의하세요. 즐거운 자리에서도 절제가 필요합니다.`,
  (p: ZodiacProfile) => `체력 관리에 신경 쓰세요. 규칙적인 운동 습관이 건강을 지켜줍니다.`,
  (p: ZodiacProfile) => `전반적으로 컨디션이 좋은 날이에요. 이 기회에 좀 더 강도 높은 운동을 해보세요.`,
  (p: ZodiacProfile) => `마음의 건강도 중요합니다. 좋아하는 음악을 듣거나 일기를 써보세요.`,
  (p: ZodiacProfile) => `친구와 함께하는 운동이 효과 만점! 러닝 메이트를 구해보세요.`,
  (p: ZodiacProfile) => `목과 기관지 관리에 신경 쓰세요. 따뜻한 물을 자주 마시는 것이 좋습니다.`,
  (p: ZodiacProfile) => `디톡스가 필요한 날. 가벼운 식단과 충분한 물 섭취로 몸을 정화해보세요.`,
  (p: ZodiacProfile) => `새로운 운동을 시작해보기 좋은 날. ${pick(p.luckyActivities, () => 0.6)} 같은 활동을 추천합니다.`,
  (p: ZodiacProfile) => `활동적인 에너지를 잘 활용하세요. 러닝이나 사이클링이 특히 좋습니다.`,
  (p: ZodiacProfile) => `오늘은 잠을 충분히 자는 것이 보약이에요. 수면 환경을 점검해보세요.`,
  (p: ZodiacProfile) => `비타민C가 풍부한 과일을 섭취하면 면역력이 올라가는 날이에요.`,
  (p: ZodiacProfile) => `장시간 앉아있지 마세요. 50분마다 일어나서 가볍게 움직여주세요.`,
  (p: ZodiacProfile) => `오늘은 물을 평소보다 한 잔 더 마셔보세요. 작은 습관이 건강을 바꿉니다.`,
  (p: ZodiacProfile) => `허리 건강에 주의하세요. 바른 자세를 유지하고 코어 운동을 해보세요.`,
  (p: ZodiacProfile) => `아침 식사를 거르지 마세요. 에너지 넘치는 하루의 시작은 아침밥에서부터!`,
  (p: ZodiacProfile) => `피부가 건조해질 수 있어요. 보습에 신경 쓰고 물을 많이 마시세요.`,
  (p: ZodiacProfile) => `오늘은 계단 오르기를 실천해보세요. 일상 속 작은 운동이 건강을 지켜줍니다.`,
  (p: ZodiacProfile) => `스트레스 해소를 위해 좋아하는 취미 활동을 해보세요. 마음의 건강도 몸의 건강이에요.`,
  (p: ZodiacProfile) => `카페인 섭취를 줄여보세요. 대신 허브티나 과일차로 바꿔보면 어떨까요?`,
  (p: ZodiacProfile) => `오늘은 스마트폰을 좀 내려놓고 눈을 쉬게 해주세요. 20-20-20 규칙을 실천해보세요.`,
  (p: ZodiacProfile) => `가벼운 댄스나 체조로 기분 전환을 해보세요. 몸을 움직이면 마음도 가벼워져요!`,
  (p: ZodiacProfile) => `배가 부르면 바로 눕지 마세요. 가벼운 산책이 소화를 도와줍니다.`,
  (p: ZodiacProfile) => `잠들기 1시간 전에는 스마트폰을 내려놓으세요. 숙면의 질이 확 달라질 거예요.`,
  (p: ZodiacProfile) => `오늘의 건강 팁: 하루 10분 명상! ${p.label}의 마음과 몸을 동시에 치유해줄 거예요.`,
];

// ─── 데이터 생성 ───
interface FortuneEntry {
  zodiacKey: string;
  dayOfYear: number;
  overall: string;
  love: string;
  money: string;
  health: string;
  overallScore: number;
  loveScore: number;
  moneyScore: number;
  healthScore: number;
}

function generateAllFortunes(): FortuneEntry[] {
  const entries: FortuneEntry[] = [];

  for (const profile of ZODIAC_PROFILES) {
    for (let day = 1; day <= 365; day++) {
      const seed = profile.key.charCodeAt(0) * 10000 + profile.key.charCodeAt(1) * 100 + day;
      const rng = mulberry32(seed);

      const season = getSeason(day);
      const seasonalBonus = pick(SEASONAL_OVERALL[season], rng);

      // 총운: 메인 템플릿 + 계절 보너스
      const overallTemplate = pick(OVERALL_TEMPLATES, rng);
      const overallBase = overallTemplate(profile, season);
      const overall = `${overallBase} ${seasonalBonus}`;

      // 애정운
      const loveTemplate = pick(LOVE_TEMPLATES, rng);
      const love = loveTemplate(profile);

      // 금전운
      const moneyTemplate = pick(MONEY_TEMPLATES, rng);
      const money = moneyTemplate(profile);

      // 건강운
      const healthTemplate = pick(HEALTH_TEMPLATES, rng);
      const health = healthTemplate(profile);

      // 점수
      const overallScore = pickScore(rng, profile.scoreBias);
      const loveScore = pickScore(rng, 0);
      const moneyScore = pickScore(rng, 0);
      const healthScore = pickScore(rng, 0);

      entries.push({
        zodiacKey: profile.key,
        dayOfYear: day,
        overall,
        love,
        money,
        health,
        overallScore,
        loveScore,
        moneyScore,
        healthScore,
      });
    }
  }

  return entries;
}

// ─── 시드 실행 ───
async function seed() {
  console.log("Generating 4,380 zodiac fortune entries...");
  const entries = generateAllFortunes();
  console.log(`Generated ${entries.length} entries`);

  // 기존 데이터 삭제
  await db.delete(zodiacFortunes);
  console.log("Cleared existing zodiac_fortunes data");

  // 배치 삽입 (100개씩)
  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    await db.insert(zodiacFortunes).values(batch);
    inserted += batch.length;

    if (inserted % 500 === 0 || inserted === entries.length) {
      console.log(`Inserted ${inserted}/${entries.length} rows`);
    }
  }

  console.log("Zodiac fortune seed completed!");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
