// Builds the Gemini consultation input from public-data indicators and JEV's structured answers.
// Shared so the browser can show learners exactly what Gemini receives.
import { buildQuestions, CHOICE_LABELS, SCORE_LEVELS } from './jev-questions.mjs';
import { composite, scanRanking, crossCheck, DEFAULT_WEIGHTS } from './analysis.mjs';

// Only known criteria with weights 0~3 are accepted from the browser.
export function sanitizeWeights(w) {
  if (!w || typeof w !== 'object') return DEFAULT_WEIGHTS;
  const out = {};
  for (const k of Object.keys(DEFAULT_WEIGHTS)) out[k] = Number.isInteger(w[k]) && w[k] >= 0 && w[k] <= 3 ? w[k] : DEFAULT_WEIGHTS[k];
  return out;
}
import { validateQuestion, KEY_PATTERN } from './question-schema.mjs';

export const GEMINI_MODEL = 'gemini-3.5-flash-lite';

export const SYSTEM_PROMPT = `당신은 상권을 분석하는 사람을 돕는 교육용 상권 분석 해설가입니다. JEV(구조화된 판단 AI)가 공공데이터를 여러 기준으로 판단한 결과를 받아, 그 판단을 확인하고 쉽게 풀어 설명합니다.
규칙:
1. 제공된 공공데이터 수치와 JEV 판단만 근거로 삼고, 없는 통계(매출, 유동인구, 임대료, 폐업률 등)를 지어내지 마세요.
2. JEV 판단을 인용할 때는 질문 키와 점수·확률을 함께 적으세요. 예: "경쟁 압력(competition_pressure) 3.1/4".
3. 각 JEV 판단이 근거 숫자와 맞는지 직접 확인하세요. "교차 확인" 표에서 '확인 필요'인 항목은 왜 차이가 날 수 있는지 두 가지 가능성을 설명하세요. JEV가 틀렸다고 단정하지 마세요.
4. JEV의 확률·점수는 창업 성공 확률이 아닙니다. 확률이 여러 단계에 퍼져 있거나(불확실성 ±값이 큼) 선택지 확률이 비슷하면 불확실하다고 분명히 말하세요.
5. "사실(공공데이터)", "JEV 판단", "해설가 의견"을 구분해서 쓰세요.
6. 창업을 하라/하지 말라고 결론 내리지 말고, 현장에서 무엇을 확인해야 하는지 구체적으로 안내하세요.
7. 한국어로 쓰고, 마크다운 제목(##)과 글머리표(-)를 사용하세요.`;

export const LEVELS = {
  easy: { name: '입문자용 쉬운 설명', style: '상권 분석을 처음 배우는 사람을 위해 중학생도 이해할 수 있는 쉬운 말로 쓰세요. 전문 용어는 처음 나올 때 괄호로 풀어 주고, 일상적인 비유를 1~2개 사용하세요. 문장은 짧게 쓰세요.' },
  pro: { name: '분석가용 요약', style: '상권 분석 실무자를 위해 간결하게 쓰세요. 수치와 기준을 앞세우고, 비유는 쓰지 마세요.' }
};

export function initialRequest(level = 'easy') {
  const l = LEVELS[level] ?? LEVELS.easy;
  return `위 자료로 상권 분석 해설을 작성해 주세요. ${l.style}
다음 순서의 제목을 사용하세요. 자료에 없는 분석 묶음(다기준 평가, 업종 스캔)의 제목은 생략하세요.
## 한 줄 결론
## JEV 판단 확인하기 (기준별로 "JEV 판단 → 근거 숫자 → 맞음/다시 볼 점" 형식의 글머리표)
## 쉽게 풀어 보는 이 상권
## 다기준 평가 읽기 (종합 점수와 강점·약점 기준, 불확실한 기준)
## 업종 스캔에서 눈여겨볼 점 (여지가 큰 업종·작은 업종과 선택 업종의 위치)
## 기회와 위험
## 현장 조사 계획 (구체적인 행동 4~6개)
## 용어 풀이 (이 글에 나온 용어 3~5개)`;
}
export const INITIAL_REQUEST = initialRequest('easy');

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
export function buildConsultContext({ profile, answers, note, extra, demo, weights }) {
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
    `- 연관 업종(손님을 끌어올 수 있는 업종, 교육용 가정)의 입지계수: ${p.relatedIndustries.map(r => `${r.name} ${r.locationQuotient}`).join(', ') || '없음'}`,
    ...(p.candidates.length ? ['- 비교 후보: ' + p.candidates.map(c => `${c.region} 비중 ${pct(c.share)}, 입지계수 ${c.locationQuotient}, 점포 ${c.count.toLocaleString('ko-KR')}곳`).join(' / ')] : []),
    '',
    '## 학습자의 창업 메모',
    note.trim(),
    '',
    `## JEV 구조화 판단${demo ? ' (주의: 수업용 규칙으로 만든 예시 값이며 실제 JEV 응답이 아님. 이 점을 상담에 밝히세요.)' : ' (TypeSafe JEV jev-latest 실제 응답)'}`,
    ...Object.entries(questions).filter(([k]) => clean[k] && !k.startsWith('scan_')).map(([k, q]) => describeAnswer(k, q, clean[k]))
  ];
  const comp = composite(clean, sanitizeWeights(weights));
  if (comp) {
    lines.push('', '## 다기준 평가 종합 (화면에서 계산)',
      `- 현장 조사 매력도 ${(comp.value * 100).toFixed(0)}점 / 100${comp.sd != null ? ` (JEV 확률 분포로 본 불확실성 ±${(comp.sd * 100).toFixed(0)})` : ''}`,
      `- 계산: 기준별 JEV 점수를 0~1로 바꿔(경쟁 압력은 뒤집음) 가중 평균. 가중치: ${comp.parts.map(x => `${x.name} ${x.weight}`).join(', ')}`,
      `- 기준별 기여(0~1): ${comp.parts.map(x => `${x.name} ${x.norm.toFixed(2)}`).join(', ')}`);
  }
  const rank = scanRanking(p, clean);
  if (rank.length) {
    const pos = rank.findIndex(r => r.name === p.industry);
    lines.push('', '## 업종 스캔 (JEV가 업종별 진입 여지를 0~4로 평가, 높을수록 여지 큼)',
      ...rank.map((r, i) => `- ${i + 1}. ${r.name}: ${r.score.toFixed(2)}${r.sd != null ? ` ±${r.sd.toFixed(2)}` : ''} (비중 ${pct(r.share)}, 입지계수 ${r.locationQuotient})${r.name === p.industry ? ' ← 선택 업종' : ''}`),
      pos >= 0 ? `- 선택 업종 ${p.industry}은(는) ${rank.length}개 업종 중 ${pos + 1}위` : '');
  }
  const checks = crossCheck(p, clean);
  if (checks.length) {
    const fmt = (v) => typeof v === 'number' ? v.toFixed(2) : CHOICE_LABELS.market_pattern[v] ?? v;
    lines.push('', '## 교차 확인 (JEV 판단 vs 숫자로 만든 단순 규칙, 차이 1.2 이상이면 확인 필요)',
      ...checks.map(c => `- ${c.name}(${c.key}): JEV ${fmt(c.jev)}${c.expected != null ? ` / 규칙 ${fmt(c.expected)}` : ''} / 근거 ${c.basis} → ${c.status === 'agree' ? '일치' : c.status === 'check' ? '확인 필요' : '규칙 없음'}`));
  }
  return lines.join('\n');
}
