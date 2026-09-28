import { sanitizeProfile } from '../../shared/market-profile.mjs';
import { buildConsultContext, GEMINI_MODEL, SYSTEM_PROMPT, initialRequest, LEVELS } from '../../shared/consult-prompt.mjs';

// Gemini turns JEV's structured judgements into a narrative consultation.
// The learner's Gemini key is used for this request only; it is not persisted or logged.
const json = (status, value) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
});
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

export default async function handler(request) {
  if (request.method !== 'POST') return json(405, { error: 'POST 요청만 가능합니다.' });
  let body;
  try { body = await request.json(); } catch { return json(400, { error: '요청 형식이 올바르지 않습니다.' }); }
  const { apiKey, evidence, answers, note, extra, demo, history, question, weights, level = 'easy' } = body ?? {};
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > 512)
    return json(400, { error: 'Gemini API 키를 확인해 주세요.' });
  if (typeof note !== 'string' || note.trim().length < 10 || note.length > 600)
    return json(400, { error: '창업 메모를 10~600자로 적어 주세요.' });
  const profile = sanitizeProfile(evidence);
  if (!profile) return json(400, { error: '상권 통계를 다시 선택해 주세요.' });
  if (!Object.hasOwn(LEVELS, level)) return json(400, { error: '설명 수준을 다시 선택해 주세요.' });
  const context = buildConsultContext({ profile, answers, note, extra: extra ?? null, demo: demo === true, weights });
  if (!context) return json(400, { error: 'JEV 분석 결과가 없습니다. 먼저 JEV 분석을 실행해 주세요.' });

  // Follow-up chat: earlier turns plus one new learner question.
  const turns = Array.isArray(history) ? history : [];
  if (turns.length > 12 || !turns.every(t => (t?.role === 'user' || t?.role === 'model') && typeof t.text === 'string' && t.text.length <= 8000))
    return json(400, { error: '대화 기록이 너무 길어요. 상담을 새로 시작해 주세요.' });
  if (question != null && (typeof question !== 'string' || !question.trim() || question.length > 500))
    return json(400, { error: '추가 질문은 1~500자로 적어 주세요.' });

  const contents = [{ role: 'user', parts: [{ text: `${context}\n\n${initialRequest(level)}` }] },
    ...turns.map(t => ({ role: t.role, parts: [{ text: t.text }] }))];
  if (question != null) contents.push({ role: 'user', parts: [{ text: question.trim() }] });
  if (contents.at(-1).role !== 'user') return json(400, { error: '추가 질문을 입력해 주세요.' });

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey.trim() },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents,
        generationConfig: { temperature: 0.4, maxOutputTokens: 4096 } }),
      signal: AbortSignal.timeout(25000)
    });
  } catch {
    return json(502, { error: 'Gemini 서버 연결에 실패했습니다. 잠시 후 다시 시도해 주세요.' });
  }
  let raw = null;
  try { raw = await response.json(); } catch { /* handled below */ }
  if (!response.ok) {
    const reason = raw?.error?.details?.find?.(d => d?.reason)?.reason ?? raw?.error?.status;
    const message = reason === 'API_KEY_INVALID' || response.status === 401 || response.status === 403 ? 'Gemini API 키 또는 접근 권한을 확인해 주세요.'
      : response.status === 404 ? `${GEMINI_MODEL} 모델을 사용할 수 없습니다. 키의 프로젝트에서 모델을 쓸 수 있는지 확인해 주세요.`
      : response.status === 429 ? 'Gemini 호출 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'
      : `Gemini 요청이 실패했습니다 (HTTP ${response.status}).`;
    const status = [401, 403, 404, 429].includes(response.status) ? response.status : response.status >= 500 ? 502 : 400;
    return json(status, { error: message });
  }
  const candidate = raw?.candidates?.[0];
  const text = candidate?.content?.parts?.map(p => p.text ?? '').join('').trim();
  if (!text) {
    const blocked = raw?.promptFeedback?.blockReason || candidate?.finishReason;
    return json(502, { error: blocked ? `Gemini가 답변을 만들지 못했습니다 (${blocked}).` : 'Gemini 응답이 비어 있습니다.' });
  }
  return json(200, { text, model: raw.modelVersion ?? GEMINI_MODEL, truncated: candidate.finishReason === 'MAX_TOKENS', context });
}

export const config = { path: '/api/gemini/consult', method: ['POST'] };
