import './learn.js';
import { getExtraQuestion, onExtraChange } from './builder.js';

const $ = (id) => document.getElementById(id);
const labels = { crowded: '상대적으로 밀집', relatively_sparse: '상대적으로 적음', mixed: '혼합 신호', insufficient: '근거 부족' };
const description = {
  crowded: '점포 비중이 높은 편입니다. 경쟁점의 고객층과 차별점을 현장에서 확인하세요.',
  relatively_sparse: '점포 비중이 낮은 편입니다. 공급 공백인지 수요 부족인지 확인하세요.',
  mixed: '숫자와 메모를 함께 해석하기 어렵습니다. 비교 지역을 추가해 보세요.',
  insufficient: '비교 숫자 외에 수요와 입지에 관한 정보가 더 필요합니다.'
};
const scoreLevels = ['낮음', '보통', '높음', '매우 높음'];
// Words that show the note already carries field evidence; used for the note hints and the rule-based example.
const signals = [
  ['임대료', /임대료|보증금|월세/], ['유동인구', /유동인구|보행|유동|동선/], ['시간대', /시간대|점심|저녁|주말|평일|하교|출근|퇴근|성수기|비수기/],
  ['고객층', /고객|직장인|학생|학부모|주민|가구|관광객|아동|수요/], ['경쟁점', /경쟁|기존|근처|주변/], ['가격·매출', /가격|매출|객단가|이용률|입주율/]
];
const scenarios = [
  { industry: 'I2', title: '역 앞 점심 식당', note: '역 앞 골목에 점심 식당이 많습니다. 직장인 수요가 실제로 꾸준한지 확인하고 싶습니다.' },
  { industry: 'P1', title: '초등 영어교실', note: '주택가에 초등학생 영어교실을 열고 싶습니다. 근처 학원과 수업 시간이 겹치는지 궁금합니다.' },
  { industry: 'G2', title: '신축 단지 생활용품', note: '신축 아파트 근처에 생활용품점을 고민 중입니다. 유입 가구가 많은지 아직 확인하지 않았습니다.' },
  { industry: 'S2', title: '주거지 세탁 서비스', note: '주거 지역에서 세탁 서비스를 열고 싶습니다. 배달 수요와 경쟁점의 가격을 비교하고 싶습니다.' },
  { industry: 'R1', title: '공원 옆 어린이 체육', note: '공원 옆에 어린이 체육 교실을 생각합니다. 주말 수요와 공간 임대료를 조사해야 합니다.' },
  { industry: 'I1', title: '관광지 작은 숙소', note: '관광지에서 작은 숙소를 준비하고 싶습니다. 계절별 수요와 허가 요건이 궁금합니다.' }
];
const STORE = 'jev-market-board-v1';

let market;
let current;
let lastResult;
const number = (n) => n.toLocaleString('ko-KR');
const percent = (n) => (n * 100).toFixed(1) + '%';
const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children); return n; };

function selectOptions(select, entries) {
  select.replaceChildren(...entries.map(([value, text]) => el('option', { value, textContent: text })));
}

function selectedEvidence() {
  const d = market.districts.find(x => x.code === $('district').value);
  if (!d) return null;
  const industry = $('industry').value;
  const peers = market.districts.filter(x => x.sido === d.sido);
  const districtCount = d.counts[industry] || 0;
  const districtTotal = total(d.counts);
  const provinceCount = peers.reduce((n, x) => n + (x.counts[industry] || 0), 0);
  const provinceTotal = peers.reduce((n, x) => n + total(x.counts), 0);
  return { region: `${market.sidos[d.sido]} ${d.name}`, industry: market.industries[industry],
    districtCount, districtTotal, provinceCount, provinceTotal,
    districtShare: districtCount / districtTotal, provinceShare: provinceCount / provinceTotal };
}

function showMix() {
  const d = market.districts.find(x => x.code === $('district').value);
  const peers = market.districts.filter(x => x.sido === d.sido);
  const dTotal = total(d.counts);
  const pTotal = peers.reduce((n, x) => n + total(x.counts), 0);
  const rows = Object.entries(market.industries).map(([code, name]) => ({
    code, name, d: (d.counts[code] || 0) / dTotal, p: peers.reduce((n, x) => n + (x.counts[code] || 0), 0) / pTotal
  })).sort((a, b) => b.d - a.d);
  const max = Math.max(...rows.flatMap(r => [r.d, r.p]));
  $('mix').replaceChildren(...rows.map(r => {
    const btn = el('button', { type: 'button', textContent: r.name, className: r.code === $('industry').value ? 'on' : '' });
    btn.addEventListener('click', () => { $('industry').value = r.code; showEvidence(); });
    return el('div', { className: 'mix-row' }, btn,
      el('div', { className: 'mix-bars' },
        el('i', { className: 'd', style: `width:${r.d / max * 100}%` }),
        el('i', { className: 'p', style: `width:${r.p / max * 100}%` })),
      el('b', { textContent: percent(r.d) }));
  }));
}

function showRank() {
  const industry = $('industry').value;
  const sido = $('sido').value;
  const ranked = market.districts.filter(x => x.sido === sido)
    .map(x => ({ code: x.code, name: x.name, share: (x.counts[industry] || 0) / total(x.counts) }))
    .sort((a, b) => b.share - a.share);
  const pos = ranked.findIndex(x => x.code === $('district').value);
  $('rankTitle').textContent = `${market.sidos[sido]} 안 ${market.industries[industry]} 비중 순위`;
  $('rankPos').textContent = ranked.length > 1 ? `${ranked.length}곳 중 ${pos + 1}위` : '비교할 시군구가 하나뿐입니다';
  // Show top 3, bottom 2, and the selected district with its neighbours so learners see the whole spread.
  const keep = new Set([0, 1, 2, ranked.length - 2, ranked.length - 1, pos - 1, pos, pos + 1].filter(i => i >= 0 && i < ranked.length));
  const max = ranked[0]?.share || 1;
  const items = [];
  let prev = -1;
  [...keep].sort((a, b) => a - b).forEach(i => {
    if (i - prev > 1) items.push(el('li', { className: 'gap', textContent: '⋯' }));
    const r = ranked[i];
    const li = el('li', { className: i === pos ? 'me' : '' },
      el('span', { textContent: `${i + 1}` }),
      el('button', { type: 'button', textContent: r.name }),
      el('div', { className: 'track' }, el('i', { style: `width:${r.share / max * 100}%` })),
      el('b', { textContent: percent(r.share) }));
    li.querySelector('button').addEventListener('click', () => { $('district').value = r.code; showEvidence(); });
    items.push(li);
    prev = i;
  });
  $('rankList').replaceChildren(...items);
}

function showEvidence() {
  current = selectedEvidence();
  if (!current) return;
  const e = current;
  $('evidenceTitle').textContent = `${e.region} · ${e.industry}`;
  $('count').textContent = number(e.districtCount) + '곳';
  $('districtName').textContent = `전체 ${number(e.districtTotal)}곳`;
  $('share').textContent = percent(e.districtShare);
  $('provinceShare').textContent = percent(e.provinceShare);
  $('barDistrictValue').textContent = percent(e.districtShare);
  $('barProvinceValue').textContent = percent(e.provinceShare);
  const max = Math.max(e.districtShare, e.provinceShare, .001);
  $('barDistrict').style.width = `${e.districtShare / max * 100}%`;
  $('barProvince').style.width = `${e.provinceShare / max * 100}%`;
  const diff = (e.districtShare - e.provinceShare) * 100;
  $('insight').textContent = `선택 지역의 업종 비중은 시도 전체보다 ${Math.abs(diff).toFixed(1)}%p ${diff > .001 ? '높습니다' : diff < -.001 ? '낮습니다' : '차이 납니다'}. 점포 수 차이가 고객 수요 차이를 의미하지는 않습니다.`;
  showMix();
  showRank();
  $('results').hidden = true;
  $('status').textContent = '';
  updatePreview();
}

function updateDistricts() {
  const entries = market.districts.filter(x => x.sido === $('sido').value).map(x => [x.code, x.name]);
  selectOptions($('district'), entries);
  showEvidence();
}

function noteSignals(note) {
  return signals.filter(([, re]) => re.test(note)).map(([name]) => name);
}

function updateNote() {
  const note = $('note').value;
  $('noteCount').textContent = `${note.length} / 600`;
  const found = noteSignals(note);
  $('noteSignals').replaceChildren(...signals.map(([name]) => el('span', { className: found.includes(name) ? 'on' : '', textContent: name })));
  $('noteSignals').title = '메모에 담긴 현장 근거 종류입니다. 많을수록 판단 재료가 구체적입니다.';
  updatePreview();
}

function updatePreview() {
  if (!current) return;
  const extra = getExtraQuestion();
  $('extraInfo').hidden = !extra;
  if (extra) $('extraInfo').textContent = `직접 만든 질문 “${extra.key}” (${extra.definition.type})도 함께 보냅니다.`;
  $('preview').textContent = JSON.stringify({
    model: 'jev-latest',
    state: { ...current, entrepreneur_note: $('note').value.trim() || '(창업 메모)' },
    questions: { market_pattern: 'choice · 상권 특성 4개 선택지', visit_priority: 'score · 조사 우선순위 0~3', needs_more_evidence: 'noul · 추가 근거 필요 여부',
      ...(extra ? { [extra.key]: extra.definition } : {}) }
  }, null, 2);
}

function probBars(probs, names, pick) {
  const entries = Object.entries(probs ?? {}).map(([k, v]) => [k, Number(v)]).filter(([, v]) => Number.isFinite(v));
  if (!entries.length) return null;
  return el('div', { className: 'dist small' }, ...entries.map(([k, v]) => el('div', { className: String(k) === String(pick) ? 'top' : '' },
    el('span', { textContent: names?.[k] ?? k }),
    el('div', { className: 'track' }, el('i', { style: `width:${Math.min(100, Math.max(0, v * 100))}%` })),
    el('b', { textContent: percent(v) }))));
}

function card({ type, title, body, value, probs, names, pick, question }) {
  const item = el('article', {}, el('small', { textContent: type }));
  if (question) item.append(el('p', { className: 'q', textContent: question }));
  item.append(el('h3', { textContent: title }), el('p', { textContent: body }));
  if (Number.isFinite(value)) {
    item.append(el('div', { className: 'prob' }, el('i', { style: `width:${Math.min(100, Math.max(0, value * 100))}%` })),
      el('p', { className: 'foot', textContent: `응답값 ${percent(value)} · 창업 성공률이 아닙니다` }));
  }
  const bars = probBars(probs, names, pick);
  if (bars) item.append(el('p', { className: 'dist-title', textContent: '선택지별 확률' }), bars);
  return item;
}

function extraCard(key, def, ans) {
  const base = { type: `직접 만든 질문 · ${def.type.toUpperCase()}`, question: def.instructions };
  if (!ans) return card({ ...base, title: '응답 없음', body: `응답에 ${key} 항목이 없습니다.` });
  if (def.type === 'choice') return card({ ...base, title: String(ans.choice ?? '응답 확인'), body: def.criteria[ans.choice] ?? '', value: Number(ans.confidence), probs: ans.probabilities, pick: ans.choice });
  if (def.type === 'score') {
    const s = Number(ans.score);
    const names = Object.fromEntries(def.criteria.map((c, i) => [i, `${i} ${c}`]));
    return card({ ...base, title: Number.isFinite(s) ? `${s.toFixed(2)} / ${def.criteria.length - 1}` : '응답 확인', body: def.criteria[Math.round(s)] ?? '', value: Number(ans.confidence), probs: ans.probabilities, names });
  }
  const y = Number(ans.noul);
  return card({ ...base, title: Number.isFinite(y) ? `예 ${percent(y)}` : '응답 확인', body: `예: ${def.criteria.true} / 아니요: ${def.criteria.false}`, value: y });
}

function buildChecklist(answers, note) {
  const found = noteSignals(note);
  const items = [];
  const choice = answers.market_pattern?.choice;
  if (choice === 'crowded') items.push('경쟁점 3곳을 골라 주 고객층·가격·영업시간을 기록한다.');
  if (choice === 'relatively_sparse') items.push('점포가 적은 이유가 수요 부족인지, 공급 공백인지 주민에게 물어본다.');
  if (choice === 'mixed' || choice === 'insufficient') items.push('비교할 시군구를 하나 더 골라 같은 업종 비중을 비교한다.');
  const missing = { '임대료': '후보 점포 2곳 이상의 임대료·보증금을 확인한다.', '유동인구': '후보 입지 앞 보행량을 10분 단위로 세어 본다.', '시간대': '평일·주말, 점심·저녁 등 시간대별로 나눠 관찰한다.', '고객층': '예상 고객이 누구인지 한 문장으로 정하고 실제로 마주치는지 확인한다.', '경쟁점': '반경 500m 안의 같은 업종 점포 위치를 지도에 표시한다.', '가격·매출': '비슷한 가게의 가격표와 붐비는 정도를 비교한다.' };
  Object.entries(missing).filter(([k]) => !found.includes(k)).slice(0, 3).forEach(([, v]) => items.push(v));
  const noul = Number(answers.needs_more_evidence?.noul);
  if (Number.isFinite(noul) && noul >= .5) items.push('조사 결과를 메모에 추가한 뒤 같은 질문으로 다시 분석해 값이 어떻게 바뀌는지 본다.');
  return items;
}

function showResult(answers, isDemo, requestBody, extra) {
  const choice = answers.market_pattern ?? {};
  const score = answers.visit_priority ?? {};
  const noul = answers.needs_more_evidence ?? {};
  const choiceName = labels[choice.choice] ?? String(choice.choice ?? '해석 불가');
  const scoreValue = Number(score.score);
  const yes = Number(noul.noul);
  const cards = [
    card({ type: 'CHOICE · 선택', title: choiceName, body: description[choice.choice] ?? '선택지를 확인해 주세요.', value: Number(choice.confidence), probs: choice.probabilities, names: labels, pick: choice.choice }),
    card({ type: 'SCORE · 순서 있는 단계', title: Number.isFinite(scoreValue) ? `${scoreValue.toFixed(2)} / 3` : '응답 확인', body: '현장 조사 우선순위의 단계 점수입니다. 높은 점수도 투자 권고가 아닙니다.', value: Number(score.confidence), probs: score.probabilities, names: Object.fromEntries(scoreLevels.map((n, i) => [i, `${i} ${n}`])) }),
    card({ type: 'NOUL · 예/아니요', title: Number.isFinite(yes) ? percent(yes) : '응답 확인', body: '추가 근거가 필요할 가능성에 대한 JEV의 응답입니다.', value: yes })
  ];
  if (extra) cards.push(extraCard(extra.key, extra.definition, answers[extra.key]));
  $('resultCards').replaceChildren(...cards);
  $('resultCards').classList.toggle('four', cards.length === 4);
  $('checklist').replaceChildren(...buildChecklist(answers, $('note').value).map(t => el('li', {}, el('label', {}, el('input', { type: 'checkbox' }), ' ' + t))));
  $('modeBadge').textContent = isDemo ? '예시 결과' : 'JEV 실제 응답';
  $('modeBadge').className = isDemo ? 'badge demo' : 'badge';
  $('modeLabel').textContent = isDemo ? '규칙으로 만든 화면 예시입니다. JEV 호출이나 실제 AI 판단이 아닙니다.' : 'TypeSafe JEV 응답입니다. 수치와 판단을 분리해 읽어 보세요.';
  $('raw').textContent = JSON.stringify({ requestBody, answers }, null, 2);
  $('saveResult').disabled = false;
  $('saveResult').firstChild.textContent = '비교 보드에 저장 ';
  lastResult = { at: Date.now(), demo: isDemo, evidence: { ...current }, answers, extra };
  $('results').hidden = false;
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Example mode: a transparent rule so learners can see how the ratio and the note move each answer.
// These numbers are NOT produced by JEV.
function demoAnswers(note, extra) {
  const k = noteSignals(note).length;
  const ratio = current.districtShare / Math.max(current.provinceShare, .00001);
  const raw = {
    crowded: .12 + Math.max(0, ratio - 1) * 3,
    relatively_sparse: .12 + Math.max(0, 1 - ratio) * 3,
    mixed: Math.max(.1, .6 - Math.abs(ratio - 1) * 2),
    insufficient: k === 0 ? .6 : k === 1 ? .25 : .08
  };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  const probs = Object.fromEntries(Object.entries(raw).map(([key, v]) => [key, +(v / sum).toFixed(3)]));
  const [choice, confidence] = Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
  const target = Math.min(3, k * .6 + (Math.abs(ratio - 1) > .15 ? .8 : .3));
  const w = [0, 1, 2, 3].map(i => Math.exp(-((i - target) ** 2)));
  const wSum = w.reduce((a, b) => a + b, 0);
  const sp = w.map(x => x / wSum);
  const answers = {
    market_pattern: { type: 'choice', choice, confidence, probabilities: probs },
    visit_priority: { type: 'score', score: +sp.reduce((n, p, i) => n + p * i, 0).toFixed(2), confidence: +Math.max(...sp).toFixed(3), probabilities: Object.fromEntries(sp.map((p, i) => [i, +p.toFixed(3)])) },
    needs_more_evidence: { type: 'noul', noul: +Math.min(.95, Math.max(.35, .95 - .1 * k)).toFixed(2) }
  };
  if (extra) {
    const { type, criteria } = extra.definition;
    if (type === 'choice') {
      const keys = Object.keys(criteria);
      answers[extra.key] = { type, choice: keys[0], confidence: +(1 / keys.length).toFixed(3), probabilities: Object.fromEntries(keys.map(x => [x, +(1 / keys.length).toFixed(3)])) };
    } else if (type === 'score') {
      const n = criteria.length;
      answers[extra.key] = { type, score: (n - 1) / 2, confidence: +(1 / n).toFixed(3), probabilities: Object.fromEntries(criteria.map((_, i) => [i, +(1 / n).toFixed(3)])) };
    } else answers[extra.key] = { type, noul: .5 };
  }
  return answers;
}

function demo() {
  if (!$('note').value.trim()) { $('note').value = '역 앞에 점포가 많은데 고객 수요가 있을지 궁금합니다. 임대료와 시간대별 유동인구를 현장에서 확인하고 싶어요.'; updateNote(); }
  const extra = getExtraQuestion();
  const note = $('note').value;
  showResult(demoAnswers(note, extra), true, { model: 'example-only', state: { ...current, entrepreneur_note: note }, questions: '질문 정의는 netlify/functions/jev-analyze.mjs 참고' + (extra ? ` + ${extra.key}` : '') }, extra);
  $('status').textContent = `예시 값은 비중 비율과 메모 속 근거 ${noteSignals(note).length}종으로 만든 규칙입니다. 메모를 바꿔 다시 눌러 보세요. 실제 JEV 분석은 API 키가 필요합니다.`;
}

async function analyze() {
  const note = $('note').value.trim();
  const key = $('apiKey').value.trim();
  if (note.length < 10) { $('status').textContent = '창업 메모를 10자 이상 입력해 주세요.'; $('note').focus(); return; }
  if (!key) { $('status').textContent = '실제 분석에는 JEV API 키가 필요합니다. 키 없이 예시 보기도 가능합니다.'; $('apiKey').focus(); return; }
  const extra = getExtraQuestion();
  $('analyze').disabled = true;
  $('status').textContent = 'JEV에 질문을 보내고 있습니다…';
  try {
    const res = await fetch('/api/jev/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key, evidence: current, note, extraQuestion: extra }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '분석에 실패했습니다.');
    showResult(data.answers, false, data.requestBody, extra);
    $('status').textContent = '실제 JEV 응답을 받았습니다.';
  } catch (error) {
    $('status').textContent = error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.';
  } finally { $('analyze').disabled = false; }
}

// Comparison board: per-browser convenience storage; the API key is never part of a saved row.
function loadBoard() {
  try { const v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function saveBoard(rows) {
  try { localStorage.setItem(STORE, JSON.stringify(rows)); } catch { /* storage unavailable: board stays in memory */ }
  memoryBoard = rows;
}
let memoryBoard = loadBoard();

function extraSummary(r) {
  if (!r.extra) return '—';
  const a = r.answers[r.extra.key];
  if (!a) return `${r.extra.key}: 응답 없음`;
  const v = r.extra.definition.type === 'choice' ? a.choice : r.extra.definition.type === 'score' ? Number(a.score).toFixed(2) : percent(Number(a.noul));
  return `${r.extra.key}: ${v}`;
}
function rowCells(r) {
  const c = r.answers.market_pattern ?? {};
  const s = r.answers.visit_priority ?? {};
  const n = Number(r.answers.needs_more_evidence?.noul);
  return [
    `${r.evidence.region} · ${r.evidence.industry}`, percent(r.evidence.districtShare), percent(r.evidence.provinceShare),
    `${labels[c.choice] ?? c.choice ?? '—'} (${Number.isFinite(Number(c.confidence)) ? percent(Number(c.confidence)) : '—'})`,
    Number.isFinite(Number(s.score)) ? Number(s.score).toFixed(2) : '—', Number.isFinite(n) ? percent(n) : '—', extraSummary(r), r.demo ? '예시' : 'JEV'
  ];
}
function renderBoard() {
  const rows = memoryBoard;
  $('boardEmpty').hidden = rows.length > 0;
  $('exportCsv').disabled = $('clearBoard').disabled = rows.length === 0;
  $('boardBody').replaceChildren(...rows.map((r, i) => {
    const del = el('button', { type: 'button', className: 'link-button', textContent: '삭제' });
    del.addEventListener('click', () => { saveBoard(rows.filter((_, j) => j !== i)); renderBoard(); });
    return el('tr', { className: r.demo ? 'demo-row' : '' }, el('td', { textContent: String(i + 1) }), ...rowCells(r).map(t => el('td', { textContent: t })), el('td', {}, del));
  }));
}
function exportCsv() {
  const head = ['번호', '지역 · 업종', '지역 비중', '시도 비중', '상권 특성', '조사 우선순위', '추가 근거 필요', '직접 만든 질문', '방식'];
  const esc = (v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [head, ...memoryBoard.map((r, i) => [String(i + 1), ...rowCells(r)])].map(r => r.map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'jev-비교보드.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initScenarios() {
  $('scenarios').replaceChildren(...scenarios.map(s => {
    const b = el('button', { type: 'button', textContent: `${market.industries[s.industry]} · ${s.title}` });
    b.addEventListener('click', () => { $('industry').value = s.industry; $('note').value = s.note; showEvidence(); updateNote(); });
    return b;
  }));
}

try {
  const response = await fetch('data/market.json');
  if (!response.ok) throw new Error('상권 데이터 파일을 불러올 수 없습니다.');
  market = await response.json();
  selectOptions($('sido'), Object.entries(market.sidos));
  selectOptions($('industry'), Object.entries(market.industries));
  $('sido').value = '11'; $('industry').value = 'I2';
  updateDistricts();
  initScenarios();
  updateNote();
  $('sido').addEventListener('change', updateDistricts);
  $('district').addEventListener('change', showEvidence);
  $('industry').addEventListener('change', showEvidence);
  $('note').addEventListener('input', updateNote);
  $('demo').addEventListener('click', demo);
  $('analyze').addEventListener('click', analyze);
  onExtraChange(updatePreview);
} catch (error) {
  $('evidenceTitle').textContent = '데이터를 읽지 못했습니다';
  $('status').textContent = error.message;
}

$('saveResult').addEventListener('click', () => {
  if (!lastResult) return;
  saveBoard([...memoryBoard, lastResult]);
  renderBoard();
  $('saveResult').disabled = true;
  $('saveResult').firstChild.textContent = `저장됨 (${memoryBoard.length}번) `;
});
$('exportCsv').addEventListener('click', exportCsv);
$('clearBoard').addEventListener('click', () => { if (confirm('비교 보드의 결과를 모두 지울까요?')) { saveBoard([]); renderBoard(); } });
renderBoard();
