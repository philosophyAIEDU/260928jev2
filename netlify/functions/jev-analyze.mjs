import { validateQuestion } from '../../shared/question-schema.mjs';
import { sanitizeProfile } from '../../shared/market-profile.mjs';
import { buildPack, PACKS } from '../../shared/jev-questions.mjs';

// JEV call is kept on the server so the browser never calls TypeSafe directly.
// The learner's key is used for this request only; it is not persisted or logged.
const json = (status, value) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'POST 요청만 가능합니다.' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: '요청 형식이 올바르지 않습니다.' }); }
  const { apiKey, evidence, note, extraQuestion, pack = 'core' } = body ?? {};
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 512)
    return json(400, { error: 'JEV API 키를 확인해 주세요.' });
  if (typeof note !== 'string' || note.trim().length < 10 || note.length > 600)
    return json(400, { error: '창업 메모를 10~600자로 적어 주세요.' });
  const profile = sanitizeProfile(evidence);
  if (!profile) return json(400, { error: '상권 통계를 다시 선택해 주세요.' });
  if (!Object.hasOwn(PACKS, pack)) return json(400, { error: '분석 묶음을 다시 선택해 주세요.' });

  // Each pack is one JEV request with many questions: core judgement (+ candidate comparison and an optional
  // learner-designed question), the multi-criteria scorecard, or the industry scan. The browser sends packs in parallel.
  let questions = buildPack(profile, pack);
  if (extraQuestion != null && pack === 'core') {
    const { key, definition } = extraQuestion;
    const errors = validateQuestion(key, definition);
    if (!errors.length && key in questions) errors.push('기본 질문과 같은 키는 쓸 수 없습니다.');
    if (errors.length) return json(400, { error: `직접 만든 질문을 확인해 주세요: ${errors[0]}` });
    const { type, instructions, criteria } = definition;
    questions = { ...questions, [key]: { type, instructions: instructions.trim(), criteria } };
  }

  const requestBody = { model: 'jev-latest', state: { ...profile, entrepreneur_note: note.trim(),
    data_caveat: '2026년 6월 업소 수 스냅샷. 임대료, 유동인구, 매출, 수익률 자료는 포함되지 않음. locationQuotient = 시군구 업종 비중 ÷ 시도 업종 비중.' }, questions };
  let response;
  try {
    response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(25000)
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
  if (!raw?.answers || typeof raw.answers !== 'object' || !Object.keys(questions).some(k => raw.answers[k]))
    return json(502, { error: 'JEV 응답에 필요한 답변이 없습니다.' });
  return json(200, { answers: raw.answers, requestBody: { ...requestBody, model: raw.model ?? requestBody.model }, model: raw.model ?? requestBody.model });
}

export const config = { path: '/api/jev/analyze', method: ['POST'] };
