// Gemini consultation: sends public-data indicators + JEV answers to /api/gemini/consult and renders the reply.
import { buildConsultContext, GEMINI_MODEL } from './shared/consult-prompt.mjs';
import { CHOICE_LABELS, SCORE_LEVELS } from './shared/jev-questions.mjs';

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
  const head = el('div', { className: 'who' }, el('b', { textContent: role === 'model' ? 'Gemini 상담' : '나의 질문' }));
  if (meta) head.append(el('span', { textContent: meta }));
  return el('article', { className: `bubble ${role}` }, head, body);
}

function setStatus(text) { $('consultStatus').textContent = text; }

// Template consultation for classrooms without a key. It only rearranges the given numbers; it is not Gemini output.
function templateConsult({ profile: p, answers: a, demo }) {
  const L = (key, v) => CHOICE_LABELS[key]?.[v] ?? v;
  const mp = a.market_pattern ?? {}, cc = a.commercial_character ?? {}, ci = a.competition_intensity ?? {};
  const risk = a.entry_risk_focus ?? {}, fit = a.hypothesis_fit ?? {}, diff = a.differentiation_needed ?? {}, more = a.needs_more_evidence ?? {};
  const lqWord = p.locationQuotient > 1.15 ? '높은' : p.locationQuotient < .85 ? '낮은' : '비슷한';
  const lines = [
    '## 한눈에 보기 (3줄 요약)',
    `- **사실**: ${p.region}의 ${p.industry} 비중은 ${pct(p.districtShare)}로 시도(${pct(p.provinceShare)})보다 ${lqWord} 편입니다 (입지계수 ${p.locationQuotient}).`,
    `- **JEV 판단**: 상권 특성은 “${L('market_pattern', mp.choice)}”${mp.confidence != null ? ` (${pct(mp.confidence)})` : ''}, 가장 먼저 볼 위험은 “${L('entry_risk_focus', risk.choice)}”입니다.`,
    `- **상담가 의견**: 숫자만으로는 매출과 수요를 알 수 없으니 현장 조사 계획부터 세워 보세요.`,
    '## 공공데이터가 말해 주는 것',
    `- 시도 안 비중 순위 ${p.rankInProvince}위 / ${p.districtsInProvince}곳, 전국 비중 ${pct(p.nationalShare)} 대비 입지계수 ${p.nationalLocationQuotient}.`,
    `- 상위 업종은 ${p.topIndustries.map(t => `${t.name} ${pct(t.share)}`).join(', ')}이고, 업종 다양성은 ${p.mixDiversity}입니다.`,
    `- ${p.specialized.length ? `시도보다 특히 많은 업종: ${p.specialized.map(s => `${s.name}(입지계수 ${s.lq})`).join(', ')}.` : '시도에 비해 두드러지게 많은 업종은 없습니다.'}`,
    '## JEV 판단 읽기 (확률과 불확실성 포함)',
    `- 상권 성격(commercial_character): “${L('commercial_character', cc.choice)}”${cc.confidence != null ? `, ${pct(cc.confidence)}` : ''}.`,
    `- 경쟁 강도(competition_intensity): ${Number(ci.score).toFixed(2)} / 4 (${SCORE_LEVELS.competition_intensity[Math.round(ci.score)] ?? '—'} 근처).`,
    `- 가설 부합(hypothesis_fit) “예” ${pct(fit.noul ?? 0)}, 차별화 필요(differentiation_needed) “예” ${pct(diff.noul ?? 0)}, 추가 근거 필요 “예” ${pct(more.noul ?? 0)}.`,
    '- 확률이 0.5 근처인 항목은 JEV도 판단이 어렵다는 신호입니다. 메모를 구체적으로 고쳐 다시 분석해 보세요.',
    '## 기회와 위험',
    `- **기회**: ${p.locationQuotient < 1 ? '같은 업종 비중이 낮아 공급 공백일 가능성이 있습니다. 다만 수요가 없어서일 수도 있습니다.' : '같은 업종이 모여 있어 이미 고객이 찾아오는 상권일 가능성이 있습니다.'}`,
    `- **위험**: ${risk.choice ? `JEV가 고른 “${L('entry_risk_focus', risk.choice)}”을(를) 먼저 확인하세요.` : '위험 항목을 확인하세요.'}`,
    '## 현장 조사 계획 (구체적인 행동 4~6개)',
    '- 평일·주말, 점심·저녁 시간대별로 후보 입지 앞 보행자를 10분씩 세어 기록합니다.',
    `- 반경 500m 안의 ${p.industry} 점포를 지도에 표시하고, 붐비는 곳과 한산한 곳을 비교합니다.`,
    '- 후보 점포 2곳 이상의 임대료·보증금·권리금을 확인합니다.',
    '- 예상 고객 5명에게 지금 어디를 이용하는지, 무엇이 불편한지 물어봅니다.',
    '## 학습자에게 드리는 질문 (2~3개)',
    '- 이 지역을 고른 가장 큰 이유는 숫자인가요, 직접 본 경험인가요?',
    '- 경쟁점과 비교해 내가 다르게 할 수 있는 한 가지는 무엇인가요?'
  ];
  return `이 글은 키 없이 보는 **예시 상담**입니다. Gemini가 쓴 글이 아니라 화면의 숫자를 정해진 문장 틀에 넣어 만들었습니다.${demo ? ' JEV 값도 예시 규칙으로 만든 값입니다.' : ''}\n\n${lines.join('\n')}`;
}

async function callGemini(question) {
  const key = $('geminiKey').value.trim();
  if (!key) { setStatus('Gemini 상담에는 API 키가 필요합니다. 키 없이 예시 상담도 볼 수 있습니다.'); $('geminiKey').focus(); return null; }
  busy = true;
  $('consultRun').disabled = true;
  setStatus(question ? 'Gemini에게 추가 질문을 보내고 있습니다…' : 'JEV 판단을 Gemini에게 보내 상담을 만들고 있습니다…');
  try {
    const res = await fetch('/api/gemini/consult', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: key, evidence: session.profile, answers: session.answers, note: session.note, extra: session.extra, demo: session.demo,
        history: question ? turns : [], question: question ?? undefined }) });
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
  $('consultInput').textContent = buildConsultContext(next) ?? 'JEV 결과가 없습니다.';
  $('consult').hidden = false;
}

$('consultRun').addEventListener('click', start);
$('consultDemo').addEventListener('click', demoConsult);
$('followForm').addEventListener('submit', follow);
