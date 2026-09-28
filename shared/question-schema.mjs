// Shared by the browser question builder and the Netlify function,
// so learners see exactly the same type checks the server applies.
export const KEY_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
export const RESERVED_KEYS = ['market_pattern', 'visit_priority', 'needs_more_evidence'];
const text = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.length <= max;

// Returns a list of Korean error messages; an empty list means the question is valid.
export function validateQuestion(key, q) {
  const errors = [];
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) errors.push('질문 키는 영어 소문자로 시작하고 소문자·숫자·밑줄만 2~40자로 써야 합니다.');
  else if (RESERVED_KEYS.includes(key)) errors.push('기본 질문과 같은 키는 쓸 수 없습니다.');
  if (!q || typeof q !== 'object') return [...errors, '질문 정의가 비어 있습니다.'];
  if (!['choice', 'score', 'noul'].includes(q.type)) errors.push('type은 choice, score, noul 중 하나여야 합니다.');
  if (!text(q.instructions, 10, 400)) errors.push('instructions(질문 지시문)는 10~400자로 적어 주세요.');
  const c = q.criteria;
  if (q.type === 'choice') {
    const entries = c && typeof c === 'object' && !Array.isArray(c) ? Object.entries(c) : [];
    if (entries.length < 2 || entries.length > 8) errors.push('choice는 선택지가 2~8개 필요합니다.');
    if (entries.some(([k]) => !KEY_PATTERN.test(k))) errors.push('선택지 키도 영어 소문자·숫자·밑줄 형식이어야 합니다.');
    if (entries.some(([, v]) => !text(v, 2, 200))) errors.push('모든 선택지에 2~200자 설명을 적어 주세요.');
  } else if (q.type === 'score') {
    if (!Array.isArray(c) || c.length < 2 || c.length > 6) errors.push('score는 낮은 단계부터 순서대로 2~6개 단계가 필요합니다.');
    else if (c.some(v => !text(v, 2, 200))) errors.push('모든 단계에 2~200자 설명을 적어 주세요.');
  } else if (q.type === 'noul') {
    if (!c || !text(c.true, 2, 200) || !text(c.false, 2, 200)) errors.push('noul은 true(예)와 false(아니요) 기준이 모두 필요합니다.');
  }
  return errors;
}
