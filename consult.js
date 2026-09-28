// Gemini consultation: sends public-data indicators + JEV answers to /api/gemini/consult and renders the reply.
import { buildConsultContext, initialRequest, GEMINI_MODEL } from './shared/consult-prompt.mjs';
import { CHOICE_LABELS, SCORE_LEVELS, SCAN_LEVELS } from './shared/jev-questions.mjs';
import { composite, scanRanking, crossCheck } from './shared/analysis.mjs';

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children); return n; };
const pct = (n) => `${(n * 100).toFixed(1)}%`;

let session = null;
let turns = [];
let busy = false;

// Minimal Markdown → DOM (headings, lists, bold, paragraphs). Uses text nodes only, so model output cannot inject HTML.
function inline(text) {
  const frag = document.createDocumentFragment();
  text.split(/(\*\*[^*]+\*\*)/g).forEach(part => {
    if (/^\*\*[^*]+\*\*$/.test(part)) frag.append(el('strong', { textContent: part.slice(2, -2) }));
    else if (part) frag.append(document.createTextNode(part));
  });
  return frag;
}
export function renderMarkdown(md) {
  const root = el('div', { className: 'md' });
  let list = null;
  let para = [];
  const flush = () => { if (para.length) { root.append(el('p', {}, inline(para.join(' ')))); para = []; } };
  for (const rawLine of md.split('\n')) {
    const line = rawLine.trimEnd();
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    const bullet = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (heading) { flush(); list = null; root.append(el(heading[1].length <= 2 ? 'h3' : 'h4', {}, inline(heading[2].replace(/\*\*/g, '')))); }
    else if (bullet) { flush(); const tag = /^\s*\d/.test(line) ? 'OL' : 'UL'; if (list?.tagName !== tag) { list = el(tag.toLowerCase()); root.append(list); } list.append(el('li', {}, inline(bullet[1]))); }
    else if (!line.trim()) { flush(); list = null; }
    else { list = null; para.push(line.trim()); }
  }
  flush();
  return root;
}

function bubble(role, text, meta) {
  const body = role === 'model' ? renderMarkdown(text) : el('p', { textContent: text });
  const head = el('div', { className: 'who' }, el('b', { textContent: role === 'model' ? 'Gemini 해설' : '나의 질문' }));
  if (meta) head.append(el('span', { textContent: meta }));
  return el('article', { className: `bubble ${role}` }, head, body);
}

function setStatus(text) { $('consultStatus').textContent = text; }

const level = () => document.querySelector('input[name=level]:checked')?.value ?? 'easy';

// Template consultation for classrooms without a key. It only rearranges the given numbers; it is not Gemini output.
function templateConsult({ profile: p, answers: a, demo, weights }) {
  const easy = level() === 'easy';
  const L = (key, v) => CHOICE_LABELS[key]?.[v] ?? v;
  const mp = a.market_pattern ?? {}, cc = a.commercial_character ?? {}, risk = a.entry_risk_focus ?? {};
  const lqWord = p.locationQuotient > 1.15 ? '많은' : p.locationQuotient < .85 ? '적은' : '비슷한';
  const comp = composite(a, weights);
  const rank = scanRanking(p, a);
  const checks = crossCheck(p, a);
  const fmt = (v) => typeof v === 'number' ? v.toFixed(2) : L('market_pattern', v);
  const lines = [
    '## 한 줄 결론',
    `- ${p.region}은(는) ${p.industry} 가게가 시도 평균보다 ${lqWord} 편이고(입지계수 ${p.locationQuotient}), JEV는 먼저 “${L('entry_risk_focus', risk.choice)}”을(를) 확인하라고 판단했습니다.`,
    '## JEV 판단 확인하기',
    ...checks.map(c => `- **${c.name}**: JEV ${fmt(c.jev)} → 근거 ${c.basis}${c.expected != null ? ` (단순 규칙 ${fmt(c.expected)})` : ''} → ${c.status === 'agree' ? '숫자와 맞습니다.' : c.status === 'check' ? '규칙과 차이가 있어 다시 볼 점입니다. JEV가 다른 숫자를 함께 봤을 수도, 규칙이 너무 단순할 수도 있습니다.' : '정성 판단이라 규칙으로 확인하지 않았습니다.'}`),
    '## 쉽게 풀어 보는 이 상권',
    easy ? `- 이 동네 가게 100곳 중 약 ${Math.round(p.districtShare * 100)}곳이 ${p.industry} 가게입니다. 시도 전체에서는 약 ${Math.round(p.provinceShare * 100)}곳입니다.`
      : `- ${p.industry} 비중 ${pct(p.districtShare)} (시도 ${pct(p.provinceShare)}, 전국 ${pct(p.nationalShare)}), 시도 안 ${p.rankInProvince}위/${p.districtsInProvince}.`,
    `- JEV는 이 상권을 “${L('commercial_character', cc.choice)}”으로 보고, 업종 특성은 “${L('market_pattern', mp.choice)}”로 분류했습니다.`,
    `- 상위 업종: ${p.topIndustries.map(t => `${t.name} ${pct(t.share)}`).join(', ')}.`
  ];
  if (comp) {
    const sorted = [...comp.parts].sort((x, y) => y.norm - x.norm);
    lines.push('## 다기준 평가 읽기',
      `- 현장 조사 매력도 **${Math.round(comp.value * 100)}점**${comp.sd != null ? ` (±${Math.round(comp.sd * 100)})` : ''}. ${easy ? '100점에 가까울수록 먼저 가 볼 만한 곳이라는 뜻이지, 성공 점수가 아닙니다.' : '기준별 정규화 점수의 가중 평균.'}`,
      `- 강점: ${sorted.slice(0, 2).map(x => x.name).join(', ')} / 약점: ${sorted.slice(-2).map(x => x.name).join(', ')}.`);
  }
  if (rank.length) {
    const pos = rank.findIndex(r => r.name === p.industry);
    lines.push('## 업종 스캔에서 눈여겨볼 점',
      `- 여지가 큰 업종: ${rank.slice(0, 3).map(r => `${r.name}(${r.score.toFixed(1)}, ${SCAN_LEVELS[Math.round(r.score)]})`).join(', ')}.`,
      `- 여지가 작은 업종: ${rank.slice(-2).map(r => `${r.name}(${r.score.toFixed(1)})`).join(', ')}.`,
      pos >= 0 ? `- 선택한 ${p.industry}은(는) ${rank.length}개 중 ${pos + 1}위입니다.` : '');
  }
  lines.push('## 현장 조사 계획',
    '- 평일·주말, 점심·저녁 시간대별로 후보 입지 앞 보행자를 10분씩 세어 기록합니다.',
    `- 반경 500m 안의 ${p.industry} 점포를 지도에 표시하고 붐비는 곳과 한산한 곳을 비교합니다.`,
    '- 후보 점포 2곳 이상의 임대료·보증금을 확인합니다.',
    '- 교차 확인에서 “다시 보기”로 나온 기준의 근거 숫자를 현장 관찰과 비교합니다.',
    '## 용어 풀이',
    '- **입지계수**: 이 지역의 업종 비중 ÷ 더 넓은 지역의 비중. 1보다 크면 그 업종이 상대적으로 몰려 있습니다.',
    '- **불확실성(±)**: JEV가 여러 단계에 확률을 나눠 줄수록 커집니다. 클수록 한 점수로 단정하기 어렵습니다.',
    '- **교차 확인**: JEV 판단을 숫자 하나로 만든 단순 규칙과 비교해 다시 볼 곳을 찾는 과정입니다.');
  return `이 글은 키 없이 보는 **예시 상담**입니다. Gemini가 쓴 글이 아니라 화면의 숫자를 정해진 문장 틀에 넣어 만들었습니다.${demo ? ' JEV 값도 예시 규칙으로 만든 값입니다.' : ''}\n\n${lines.filter(Boolean).join('\n')}`;
}

function refreshInput() {
  if (!session) return;
  const ctx = buildConsultContext(session);
  $('consultInput').textContent = ctx ? `${ctx}\n\n${initialRequest(level())}` : 'JEV 결과가 없습니다.';
}

async function callGemini(question) {
  const key = $('geminiKey').value.trim();
  if (!key) { setStatus('Gemini 상담에는 API 키가 필요합니다. 키 없이 예시 상담도 볼 수 있습니다.'); $('geminiKey').focus(); return null; }
  busy = true;
  $('consultRun').disabled = true;
  setStatus(question ? 'Gemini에게 추가 질문을 보내고 있습니다…' : 'Gemini가 JEV 판단을 근거 숫자와 대조하며 해설을 쓰고 있습니다…');
  refreshInput();
  try {
    const res = await fetch('/api/gemini/consult', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, evidence: session.profile, answers: session.answers, note: session.note, extra: session.extra, demo: session.demo,
        weights: session.weights, level: level(), history: question ? turns : [], question: question ?? undefined }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '상담 요청에 실패했습니다.');
    setStatus(`${data.model ?? GEMINI_MODEL} 응답을 받았습니다.${data.truncated ? ' 답변이 길어 중간에 끊겼을 수 있습니다.' : ''}`);
    return data.text;
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.');
    return null;
  } finally { busy = false; $('consultRun').disabled = false; }
}

async function start() {
  if (!session || busy) return;
  const text = await callGemini(null);
  if (!text) return;
  turns = [{ role: 'model', text }];
  $('chat').replaceChildren(bubble('model', text, GEMINI_MODEL));
  $('followForm').hidden = false;
}

function demoConsult() {
  if (!session) return;
  turns = [];
  $('chat').replaceChildren(bubble('model', templateConsult(session), '예시 · Gemini 아님'));
  $('followForm').hidden = true;
  setStatus('예시 상담입니다. 실제 Gemini 상담과 추가 질문은 API 키를 입력하고 실행하세요.');
}

async function follow(event) {
  event.preventDefault();
  const q = $('followInput').value.trim();
  if (!q || busy || !turns.length) return;
  if (turns.length >= 11) { setStatus('대화가 길어졌어요. 상담을 새로 받아 주세요.'); return; }
  $('chat').append(bubble('user', q));
  $('followInput').value = '';
  const text = await callGemini(q);
  if (!text) { $('chat').lastChild.remove(); $('followInput').value = q; return; }
  turns.push({ role: 'user', text: q }, { role: 'model', text });
  $('chat').append(bubble('model', text, GEMINI_MODEL));
}

// Called by the lab whenever a new JEV result (real or example) is shown.
export function resetConsult(next) {
  session = next;
  turns = [];
  $('chat').replaceChildren();
  $('followForm').hidden = true;
  setStatus('');
  $('pipeCount').textContent = String(Object.keys(next.answers).length);
  refreshInput();
  $('consult').hidden = false;
}

$('consultRun').addEventListener('click', start);
document.querySelectorAll('input[name=level]').forEach(r => r.addEventListener('change', refreshInput));
$('consultDemo').addEventListener('click', demoConsult);
$('followForm').addEventListener('submit', follow);
