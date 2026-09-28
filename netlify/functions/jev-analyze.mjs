import { validateQuestion } from '../../shared/question-schema.mjs';

// JEV call is kept on the server so the browser never calls TypeSafe directly.
// The learner's key is used for this request only; it is not persisted or logged.
const questions = {
  market_pattern: {
    type: 'choice',
    instructions: '제시된 숫자와 창업 메모를 함께 읽고 이 후보 지역의 상권 특성을 하나 고르세요. 점포 수만으로 성공 가능성을 단정하지 마세요.',
    criteria: {
      crowded: '선택 업종의 점포 비중이 비교 지역보다 높거나 메모에서 경쟁이 강함을 나타냄',
      relatively_sparse: '선택 업종의 점포 비중이 비교 지역보다 낮고 현장 수요 확인이 필요한 상태',
      mixed: '수치와 메모가 엇갈리거나 차이가 작아 한 방향으로 분류하기 어려움',
      insufficient: '메모 또는 수치만으로 상권의 맥락을 파악하기 어려움'
    }
  },
  visit_priority: {
    type: 'score',
    instructions: '창업 결론이 아니라 현장 조사를 먼저 할 우선순위를 평가하세요. 메모의 구체성, 수치와의 관계, 확인할 가설이 있는지를 고려하세요.',
    criteria: ['낮음: 현장 조사 질문부터 다시 정리', '보통: 비교 후보와 함께 조사', '높음: 가설을 가지고 현장 방문', '매우 높음: 우선 방문하여 가설 검증']
  },
  needs_more_evidence: {
    type: 'noul',
    instructions: '임대료, 유동인구, 매출, 폐업률, 시간대별 수요 등 빠진 정보 때문에 창업 판단 전에 추가 조사가 필요한가?',
    criteria: { true: '중요한 현장 또는 수요 자료가 부족함', false: '판단에 필요한 여러 검증 자료가 메모에 충분히 제시됨' }
  }
};

const json = (status, value) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'POST 요청만 가능합니다.' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: '요청 형식이 올바르지 않습니다.' }); }
  const { apiKey, evidence, note, extraQuestion } = body ?? {};
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 512)
    return json(400, { error: 'JEV API 키를 확인해 주세요.' });
  if (typeof note !== 'string' || note.trim().length < 10 || note.length > 600)
    return json(400, { error: '창업 메모를 10~600자로 적어 주세요.' });
  if (!evidence || typeof evidence !== 'object' ||
      !['region', 'industry', 'districtCount', 'districtTotal', 'provinceCount', 'provinceTotal', 'districtShare', 'provinceShare'].every(k => k in evidence) ||
      !['districtCount', 'districtTotal', 'provinceCount', 'provinceTotal', 'districtShare', 'provinceShare'].every(k => Number.isFinite(evidence[k]) && evidence[k] >= 0) ||
      evidence.districtTotal === 0 || evidence.provinceTotal === 0)
    return json(400, { error: '상권 통계를 다시 선택해 주세요.' });

  // Optional learner-designed question from the question builder, checked with the same schema as the browser.
  let allQuestions = questions;
  if (extraQuestion != null) {
    const { key, definition } = extraQuestion;
    const errors = validateQuestion(key, definition);
    if (errors.length) return json(400, { error: `직접 만든 질문을 확인해 주세요: ${errors[0]}` });
    const { type, instructions, criteria } = definition;
    allQuestions = { ...questions, [key]: { type, instructions: instructions.trim(), criteria } };
  }

  const state = Object.fromEntries(['region', 'industry', 'districtCount', 'districtTotal', 'provinceCount', 'provinceTotal', 'districtShare', 'provinceShare']
    .map(k => [k, evidence[k]]));
  const requestBody = { model: 'jev-latest', state: { ...state, entrepreneur_note: note.trim(),
    data_caveat: '2026년 6월 업소 수 스냅샷. 임대료, 유동인구, 매출, 수익률 자료는 포함되지 않음.' }, questions: allQuestions };
  let response;
  try {
    response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(20000)
    });
  } catch {
    return json(502, { error: 'JEV 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  if (!response.ok) {
    const message = response.status === 401 || response.status === 403 ? 'API 키 또는 접근 권한을 확인해 주세요.'
      : response.status === 429 ? '호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
      : `JEV 요청이 실패했습니다 (HTTP ${response.status}).`;
    return json(response.status >= 500 ? 502 : response.status, { error: message });
  }
  let raw;
  try { raw = await response.json(); } catch { return json(502, { error: 'JEV 응답을 읽을 수 없습니다.' }); }
  if (!raw?.answers || !raw.answers.market_pattern || !raw.answers.visit_priority || !raw.answers.needs_more_evidence)
    return json(502, { error: 'JEV 응답에 필요한 답변이 없습니다.', raw });
  return json(200, { answers: raw.answers, requestBody: { ...requestBody, model: raw.model ?? requestBody.model }, model: raw.model ?? requestBody.model });
}

export const config = { path: '/api/jev/analyze', method: ['POST'] };
