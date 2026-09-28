// Builds the Gemini consultation input from public-data indicators and JEV's structured answers.
// Shared so the browser can show learners exactly what Gemini receives.
import { buildQuestions, CHOICE_LABELS, SCORE_LEVELS } from './jev-questions.mjs';
import { validateQuestion, KEY_PATTERN } from './question-schema.mjs';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

export const SYSTEM_PROMPT = `당신은 소상공인 창업을 준비하는 학습자를 돕는 상권 분석 교육 상담가입니다.
규칙:
1. 제공된 공공데이터 수치와 JEV 구조화 판단만 근거로 삼고, 없는 통계(매출, 유동인구, 임대료, 폐업률 등)를 지어내지 마세요.
2. JEV 판단을 인용할 때는 질문 키와 확률을 함께 적으세요. 예: "JEV 경쟁 강도(competition_intensity) 3.1/4".
3. JEV의 확률·점수는 창업 성공 확률이 아닙니다. 확률이 서로 비슷하면 불확실하다고 분명히 말하세요.
4. "사실(공공데이터)", "JEV 판단", "상담가 의견"을 구분해서 쓰세요.
5. 창업을 하라/하지 말라고 결론 내리지 말고, 현장에서 무엇을 확인해야 하는지 구체적으로 안내하세요.
6. 한국어로, 입문자도 이해할 수 있게 쉽고 따뜻하게 쓰세요. 마크다운 제목(##)과 글머리표(-)를 사용하세요.`;

export const INITIAL_REQUEST = `위 자료로 종합 상담을 작성해 주세요. 다음 순서의 제목을 사용하세요.
## 한눈에 보기 (3줄 요약)
## 공공데이터가 말해 주는 것
## JEV 판단 읽기 (확률과 불확실성 포함)
## 기회와 위험
## 현장 조사 계획 (구체적인 행동 4~6개)
## 학습자에게 드리는 질문 (2~3개)`;

const pct = (n) => `${(n * 100).toFixed(1)}%`;
const fnum = (v) => Number.isFinite(v) && v >= 0 && v <= 100;
const shortStr = (v, max = 40) => typeof v === 'string' && v.length <= max;

// Keeps only well-typed fields of each answer so arbitrary text never reaches the prompt.
export function sanitizeAnswers(answers, questions) {
  if (!answers || typeof answers !== 'object') return null;
  const out = {};
  for (const [key, q] of Object.entries(questions)) {
    const a = answers[key];
    if (!a || typeof a !== 'object') continue;
    const clean = {};
    if (q.type === 'choice' && shortStr(a.choice) && (a.choice in q.criteria)) clean.choice = a.choice;
    if (q.type === 'score' && fnum(a.score)) clean.score = a.score;
    if (q.type === 'noul' && fnum(a.noul) && a.noul <= 1) clean.noul = a.noul;
    if (fnum(a.confidence) && a.confidence <= 1) clean.confidence = a.confidence;
    if (a.probabilities && typeof a.probabilities === 'object') {
      const probs = Object.entries(a.probabilities).filter(([k, v]) => shortStr(k) && fnum(v) && v <= 1).slice(0, 10);
      if (probs.length) clean.probabilities = Object.fromEntries(probs);
    }
    if (Object.keys(clean).length) out[key] = clean;
  }
  return Object.keys(out).length ? out : null;
}

function describeAnswer(key, q, a) {
  const labels = CHOICE_LABELS[key] ?? {};
  const levels = SCORE_LEVELS[key] ?? (Array.isArray(q.criteria) ? q.criteria : []);
  const probs = a.probabilities ? Object.entries(a.probabilities)
    .map(([k, v]) => `${q.type === 'score' ? `${k}단계` : labels[k] ?? q.criteria[k] ?? k} ${pct(v)}`).join(', ') : '';
  let main = '응답 없음';
  if (q.type === 'choice' && a.choice) main = `선택: ${labels[a.choice] ?? a.choice}${q.criteria[a.choice] ? ` (${q.criteria[a.choice]})` : ''}`;
  if (q.type === 'score' && a.score != null) main = `점수: ${a.score.toFixed(2)} / ${levels.length - 1}${levels[Math.round(a.score)] ? ` (${String(levels[Math.round(a.score)]).split(':')[0]} 근처)` : ''}`;
  if (q.type === 'noul' && a.noul != null) main = `예일 확률: ${pct(a.noul)} — 예: ${q.criteria.true} / 아니요: ${q.criteria.false}`;
  return `- ${key} [${q.type}] 질문: ${q.instructions}\n  → ${main}${a.confidence != null ? `, confidence ${pct(a.confidence)}` : ''}${probs ? `\n  → 확률 분포: ${probs}` : ''}`;
}

// profile must already be sanitised (sanitizeProfile). extra is { key, definition } or null.
export function buildConsultContext({ profile, answers, note, extra, demo }) {
  let questions = buildQuestions(profile);
  if (extra && !validateQuestion(extra.key, extra.definition).length && KEY_PATTERN.test(extra.key)) questions = { ...questions, [extra.key]: extra.definition };
  const clean = sanitizeAnswers(answers, questions);
  if (!clean) return null;
  const p = profile;
  const lines = [
    '# 상담 자료',
    `- 지역: ${p.region} / 업종 대분류: ${p.industry}`,
    `- 데이터: 소상공인시장진흥공단 상가(상권)정보 2026년 6월 점포 수 스냅샷. 매출·유동인구·임대료 없음.`,
    '',
    '## 공공데이터 지표',
    `- 선택 업종 점포 ${p.districtCount.toLocaleString('ko-KR')}곳 / 시군구 전체 ${p.districtTotal.toLocaleString('ko-KR')}곳 → 비중 ${pct(p.districtShare)}`,
    `- 시도 비중 ${pct(p.provinceShare)}, 전국 비중 ${pct(p.nationalShare)}`,
    `- 입지계수(시도 대비) ${p.locationQuotient}, 입지계수(전국 대비) ${p.nationalLocationQuotient}  (1보다 크면 해당 업종 비중이 더 높음)`,
    `- 시도 안 비중 순위 ${p.rankInProvince}위 / ${p.districtsInProvince}곳`,
    `- 규모 지수 ${p.scaleIndex} (시군구 전체 점포 수 ÷ 시도 내 시군구 평균, 1보다 크면 큰 상권)`,
    `- 업종 다양성 ${p.mixDiversity} (0~1, 1에 가까울수록 고르게 섞임)`,
    `- 상위 업종: ${p.topIndustries.map(t => `${t.name} ${pct(t.share)}`).join(', ')}`,
    `- 시도 대비 특화 업종(입지계수 1.3 이상): ${p.specialized.length ? p.specialized.map(s => `${s.name} ${s.lq}`).join(', ') : '뚜렷한 특화 업종 없음'}`,
    ...(p.candidates.length ? ['- 비교 후보: ' + p.candidates.map(c => `${c.region} 비중 ${pct(c.share)}, 입지계수 ${c.locationQuotient}, 점포 ${c.count.toLocaleString('ko-KR')}곳`).join(' / ')] : []),
    '',
    '## 학습자의 창업 메모',
    note.trim(),
    '',
    `## JEV 구조화 판단${demo ? ' (주의: 수업용 규칙으로 만든 예시 값이며 실제 JEV 응답이 아님. 이 점을 상담에 밝히세요.)' : ' (TypeSafe JEV jev-latest 실제 응답)'}`,
    ...Object.entries(questions).filter(([k]) => clean[k]).map(([k, q]) => describeAnswer(k, q, clean[k]))
  ];
  return lines.join('\n');
}
