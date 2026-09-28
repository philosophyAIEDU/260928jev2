import './learn.js';
import { getExtraQuestion, onExtraChange } from './builder.js';
import { resetConsult } from './consult.js';
import { buildProfile } from './shared/market-profile.mjs';
import { buildQuestions, buildPack, PACKS, CHOICE_LABELS, SCORE_LEVELS, CORE_KEYS, CRITERIA, SCAN_LEVELS, scanKey } from './shared/jev-questions.mjs';
import { composite, scanRanking, crossCheck, expectedScores, scoreStats, DEFAULT_WEIGHTS } from './shared/analysis.mjs';

const $ = (id) => document.getElementById(id);
const labels = CHOICE_LABELS.market_pattern;
const description = {
  market_pattern: {
    crowded: '점포 비중이 높은 편입니다. 경쟁점의 고객층과 차별점을 현장에서 확인하세요.',
    relatively_sparse: '점포 비중이 낮은 편입니다. 공급 공백인지 수요 부족인지 확인하세요.',
    mixed: '숫자와 메모를 함께 해석하기 어렵습니다. 비교 지역을 추가해 보세요.',
    insufficient: '비교 숫자 외에 수요와 입지에 관한 정보가 더 필요합니다.'
  },
  visit_priority: '현장 조사 우선순위의 단계 점수입니다. 높은 점수도 투자 권고가 아닙니다.',
  needs_more_evidence: '추가 근거가 필요할 가능성에 대한 JEV의 응답입니다.',
  hypothesis_fit: '내 메모의 가설이 공공데이터 수치와 들어맞는다는 “예” 응답값입니다.',
  differentiation_needed: '진입할 때 뚜렷한 차별화가 필요하다는 “예” 응답값입니다.'
};
const titles = {
  market_pattern: 'CHOICE · 상권 특성', visit_priority: 'SCORE · 조사 우선순위', needs_more_evidence: 'NOUL · 추가 근거 필요',
  commercial_character: 'CHOICE · 상권 전체 성격', entry_risk_focus: 'CHOICE · 먼저 검증할 위험',
  hypothesis_fit: 'NOUL · 메모 가설과 수치 부합', differentiation_needed: 'NOUL · 차별화 필요', first_visit: 'CHOICE · 먼저 방문할 후보'
};
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
let lastAnswers = null;
const packs = new Set(['core', 'criteria', 'scan']);
const weights = { ...DEFAULT_WEIGHTS };  // mutated in place so the Gemini session always sees the current weights
const number = (n) => n.toLocaleString('ko-KR');
const percent = (n) => (n * 100).toFixed(1) + '%';
const total = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
const el = (tag, props = {}, ...children) => { const n = Object.assign(document.createElement(tag), props); n.append(...children); return n; };

function selectOptions(select, entries) {
  select.replaceChildren(...entries.map(([value, text]) => el('option', { value, textContent: text })));
}

function selectedEvidence() {
  return buildProfile(market, $('district').value, $('industry').value, [$('cand1').value, $('cand2').value]);
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

function showDeep() {
  const e = current;
  const lqNote = (lq) => lq > 1.15 ? '평균보다 높음' : lq < .85 ? '평균보다 낮음' : '평균과 비슷';
  const tiles = [
    ['입지계수 (시도 대비)', e.locationQuotient.toFixed(2), `${lqNote(e.locationQuotient)} · 지역 비중 ÷ 시도 비중`],
    ['입지계수 (전국 대비)', e.nationalLocationQuotient.toFixed(2), `전국 비중 ${percent(e.nationalShare)}`],
    ['상권 규모 지수', e.scaleIndex.toFixed(2), '전체 점포 수 ÷ 시도 내 시군구 평균'],
    ['업종 다양성', e.mixDiversity.toFixed(2), '0~1 · 1에 가까울수록 고르게 섞임'],
    ['상위 업종', e.topIndustries.map(t => t.name).join(' · '), e.topIndustries.map(t => percent(t.share)).join(' · ')],
    ['특화 업종', e.specialized.length ? e.specialized.map(s => s.name).join(' · ') : '없음', e.specialized.length ? e.specialized.map(s => `입지계수 ${s.lq}`).join(' · ') : '시도 대비 1.3배 이상인 업종']
  ];
  $('deepMetrics').replaceChildren(...tiles.map(([k, v, s]) => el('div', {}, el('span', { textContent: k }), el('strong', { textContent: v }), el('small', { textContent: s }))));
}

function candidateOptions() {
  const code = $('district').value;
  const entries = [['', '선택 안 함'], ...market.districts.filter(x => x.sido === $('sido').value && x.code !== code).map(x => [x.code, x.name])];
  for (const id of ['cand1', 'cand2']) {
    const keep = $(id).value;
    selectOptions($(id), entries);
    if (entries.some(([c]) => c === keep)) $(id).value = keep;
  }
  if ($('cand2').value && $('cand2').value === $('cand1').value) $('cand2').value = '';
}

function showEvidence() {
  candidateOptions();
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
  showDeep();
  $('results').hidden = true;
  $('consult').hidden = true;
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

function allQuestions() {
  const extra = getExtraQuestion();
  const q = buildQuestions(current, [...packs]);
  return extra && !(extra.key in q) ? { ...q, [extra.key]: extra.definition } : q;
}

function updatePreview() {
  if (!current) return;
  const extra = getExtraQuestion();
  const questions = allQuestions();
  $('extraInfo').hidden = !extra;
  if (extra) $('extraInfo').textContent = `직접 만든 질문 “${extra.key}” (${extra.definition.type})도 함께 보냅니다.`;
  const keys = Object.keys(questions);
  $('questionCount').replaceChildren(el('b', { textContent: `JEV 요청 ${packs.size}회(동시) · 질문 ${keys.length}개` }),
    el('div', { className: 'q-chips' }, ...keys.map(k => el('span', { className: questions[k].type, textContent: `${k} · ${questions[k].type}` }))));
  $('preview').textContent = JSON.stringify({
    model: 'jev-latest',
    state: { ...current, entrepreneur_note: $('note').value.trim() || '(창업 메모)' },
    questions
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

// Renders any JEV answer from its question definition, so built-in, deep and learner-made questions look alike.
function answerCard(key, def, ans, custom) {
  const base = { type: custom ? `직접 만든 질문 · ${def.type.toUpperCase()}` : titles[key] ?? key, question: custom || key === 'first_visit' ? def.instructions : undefined };
  if (!ans) return card({ ...base, title: '응답 없음', body: `응답에 ${key} 항목이 없습니다.` });
  if (def.type === 'choice') {
    const names = CHOICE_LABELS[key] ?? (key === 'first_visit' ? Object.fromEntries(Object.entries(def.criteria).map(([k, v]) => [k, v.replace(/을\(를\) 먼저 방문$/, '')])) : undefined);
    const body = typeof description[key] === 'object' ? description[key][ans.choice] : def.criteria[ans.choice];
    return card({ ...base, title: names?.[ans.choice] ?? String(ans.choice ?? '응답 확인'), body: body ?? '선택지를 확인해 주세요.', value: Number(ans.confidence), probs: ans.probabilities, names, pick: ans.choice });
  }
  if (def.type === 'score') {
    const s = Number(ans.score);
    const levels = SCORE_LEVELS[key] ?? def.criteria;
    const names = Object.fromEntries(levels.map((c, i) => [i, `${i} ${String(c).split(':')[0]}`]));
    return card({ ...base, title: Number.isFinite(s) ? `${s.toFixed(2)} / ${levels.length - 1}` : '응답 확인', body: description[key] ?? def.criteria[Math.round(s)] ?? '', value: Number(ans.confidence), probs: ans.probabilities, names });
  }
  const y = Number(ans.noul);
  return card({ ...base, title: Number.isFinite(y) ? `예 ${percent(y)}` : '응답 확인', body: description[key] ?? `예: ${def.criteria.true} / 아니요: ${def.criteria.false}`, value: y });
}

function buildChecklist(answers, note) {
  const found = noteSignals(note);
  const items = [];
  const choice = answers.market_pattern?.choice;
  if (choice === 'crowded') items.push('경쟁점 3곳을 골라 주 고객층·가격·영업시간을 기록한다.');
  if (choice === 'relatively_sparse') items.push('점포가 적은 이유가 수요 부족인지, 공급 공백인지 주민에게 물어본다.');
  if (choice === 'mixed' || choice === 'insufficient') items.push('비교할 시군구를 하나 더 골라 같은 업종 비중을 비교한다.');
  const risk = { oversupply: '같은 업종 점포가 붐비는 시간과 한산한 시간을 비교해 과밀 정도를 확인한다.', demand_unclear: '예상 고객 5명에게 지금 어디서 이 서비스를 이용하는지 묻는다.', cost_unknown: '후보 점포의 임대료·보증금·관리비를 확인해 월 고정비를 계산한다.', customer_mismatch: '지역의 상위 업종이 끌어오는 손님이 내 목표 고객과 같은지 관찰한다.', info_gap: '메모에 목표 고객·시간대·가격대를 한 줄씩 더 적는다.' }[answers.entry_risk_focus?.choice];
  if (risk) items.push(risk);
  const missing = { '임대료': '후보 점포 2곳 이상의 임대료·보증금을 확인한다.', '유동인구': '후보 입지 앞 보행량을 10분 단위로 세어 본다.', '시간대': '평일·주말, 점심·저녁 등 시간대별로 나눠 관찰한다.', '고객층': '예상 고객이 누구인지 한 문장으로 정하고 실제로 마주치는지 확인한다.', '경쟁점': '반경 500m 안의 같은 업종 점포 위치를 지도에 표시한다.', '가격·매출': '비슷한 가게의 가격표와 붐비는 정도를 비교한다.' };
  Object.entries(missing).filter(([k]) => !found.includes(k)).slice(0, 2).forEach(([, v]) => items.push(v));
  if (Number(answers.differentiation_needed?.noul) >= .5) items.push('경쟁점과 다르게 할 한 가지(가격·품질·시간대·고객층)를 정해 적는다.');
  const noul = Number(answers.needs_more_evidence?.noul);
  if (Number.isFinite(noul) && noul >= .5) items.push('조사 결과를 메모에 추가한 뒤 같은 질문으로 다시 분석해 값이 어떻게 바뀌는지 본다.');
  return items;
}

const fmtScore = (v) => Number.isFinite(v) ? v.toFixed(2) : '—';

function renderComposite() {
  if (!lastAnswers) return;
  const comp = composite(lastAnswers, weights);
  $('compValue').textContent = comp ? `${Math.round(comp.value * 100)}` : '—';
  $('compSd').textContent = comp ? `/ 100${comp.sd != null ? ` · 불확실성 ±${Math.round(comp.sd * 100)}` : ''}` : '가중치가 모두 0입니다';
  const lo = comp ? Math.max(0, comp.value - (comp.sd ?? 0)) : 0, hi = comp ? Math.min(1, comp.value + (comp.sd ?? 0)) : 0;
  $('compBar').style.width = comp ? `${comp.value * 100}%` : '0';
  $('compRange').style.cssText = `left:${lo * 100}%;width:${(hi - lo) * 100}%`;
}

function renderCriteria(answers) {
  const has = CRITERIA.some(c => answers[c.key]);
  $('criteriaBox').hidden = !has;
  if (!has) return;
  const rows = CRITERIA.filter(c => c.direction).map(c => {
    const st = scoreStats(answers[c.key]);
    const levels = SCORE_LEVELS[c.key];
    const w = el('select', { title: '가중치' }, ...[0, 1, 2, 3].map(v => el('option', { value: v, textContent: `가중치 ${v}` })));
    w.value = String(weights[c.key]);
    w.addEventListener('change', () => { weights[c.key] = Number(w.value); renderComposite(); });
    const bar = el('div', { className: 'crit-bar' });
    if (st) {
      if (st.sd != null) bar.append(el('span', { style: `left:${Math.max(0, st.score - st.sd) / 4 * 100}%;width:${(Math.min(4, st.score + st.sd) - Math.max(0, st.score - st.sd)) / 4 * 100}%` }));
      bar.append(el('i', { style: `width:${st.score / 4 * 100}%` }));
    }
    const unsure = st?.sd != null && st.sd >= .9;
    return el('div', { className: 'crit-row' + (unsure ? ' unsure' : '') },
      el('div', { className: 'crit-name' }, el('b', { textContent: c.name }), el('small', { textContent: c.direction < 0 ? '낮을수록 유리' : '높을수록 유리' })),
      bar,
      el('div', { className: 'crit-val' }, el('b', { textContent: st ? `${fmtScore(st.score)}` : '응답 없음' }), el('small', { textContent: st ? `${levels[Math.round(st.score)] ?? ''}${st.sd != null ? ` ±${st.sd.toFixed(2)}` : ''}${unsure ? ' · 불확실' : ''}` : '' })),
      w);
  });
  $('criteriaRows').replaceChildren(...rows);
  const conf = scoreStats(answers.data_confidence);
  $('confBadge').replaceChildren(...(conf ? [el('b', { textContent: `데이터 신뢰도 ${fmtScore(conf.score)} / 4` }), el('span', { textContent: ` ${SCORE_LEVELS.data_confidence[Math.round(conf.score)]} — ${conf.score < 2 ? '점포 수가 적어 위 점수들이 쉽게 흔들릴 수 있습니다.' : '점포 수가 충분해 비율이 비교적 안정적입니다.'}` })] : []));
  renderComposite();
}

function renderScan(answers) {
  const rank = scanRanking(current, answers);
  $('scanBox').hidden = !rank.length;
  $('scanList').replaceChildren(...rank.map((r, i) => {
    const btn = el('button', { type: 'button', textContent: r.name });
    btn.addEventListener('click', () => { $('industry').value = r.code; showEvidence(); $('lab').scrollIntoView({ behavior: 'smooth' }); });
    return el('li', { className: r.name === current.industry ? 'me' : '' },
      el('span', { className: 'rk', textContent: String(i + 1) }), btn,
      el('div', { className: 'crit-bar' }, ...(r.sd != null ? [el('span', { style: `left:${Math.max(0, r.score - r.sd) / 4 * 100}%;width:${(Math.min(4, r.score + r.sd) - Math.max(0, r.score - r.sd)) / 4 * 100}%` })] : []), el('i', { style: `width:${r.score / 4 * 100}%` })),
      el('b', { textContent: fmtScore(r.score) }),
      el('small', { textContent: `${SCAN_LEVELS[Math.round(r.score)]} · 비중 ${percent(r.share)} · 입지계수 ${r.locationQuotient}` }));
  }));
}

function renderChecks(answers) {
  const rows = crossCheck(current, answers);
  $('checkBox').hidden = !rows.length;
  const fmt = (v) => typeof v === 'number' ? v.toFixed(2) : labels[v] ?? v ?? '—';
  const text = { agree: '✓ 일치', check: '! 다시 보기', info: '— 규칙 없음' };
  $('checkRows').replaceChildren(...rows.map(r => el('tr', { className: r.status },
    el('th', { textContent: r.name }), el('td', { textContent: fmt(r.jev) }), el('td', { textContent: r.expected == null ? '—' : fmt(r.expected) }),
    el('td', { textContent: r.basis }), el('td', { className: 'st', textContent: text[r.status] }))));
}

function showResult(answers, isDemo, requestBody, extra) {
  const questions = buildQuestions(current, ['core']);
  lastAnswers = answers;
  $('resultCards').replaceChildren(...CORE_KEYS.map(k => answerCard(k, questions[k], answers[k])));
  const deep = Object.keys(questions).filter(k => !CORE_KEYS.includes(k)).map(k => answerCard(k, questions[k], answers[k]));
  if (extra) deep.push(answerCard(extra.key, extra.definition, answers[extra.key], true));
  $('deepCards').replaceChildren(...deep);
  renderCriteria(answers);
  renderScan(answers);
  renderChecks(answers);
  $('checklist').replaceChildren(...buildChecklist(answers, $('note').value).map(t => el('li', {}, el('label', {}, el('input', { type: 'checkbox' }), ' ' + t))));
  $('modeBadge').textContent = isDemo ? '예시 결과' : 'JEV 실제 응답';
  $('modeBadge').className = isDemo ? 'badge demo' : 'badge';
  $('modeLabel').textContent = isDemo ? '규칙으로 만든 화면 예시입니다. JEV 호출이나 실제 AI 판단이 아닙니다.' : `TypeSafe JEV 응답입니다. 요청 ${Array.isArray(requestBody) ? requestBody.length : 1}회로 ${Object.keys(answers).length}개 질문의 답을 받았습니다.`;
  $('raw').textContent = JSON.stringify({ requestBody, answers }, null, 2);
  $('saveResult').disabled = false;
  $('saveResult').firstChild.textContent = '비교 보드에 저장 ';
  lastResult = { at: Date.now(), demo: isDemo, evidence: { ...current }, answers, extra, weights };
  resetConsult({ profile: current, answers, note: $('note').value.trim(), extra: extra ?? null, demo: isDemo, weights });
  $('results').hidden = false;
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Example mode: a transparent rule so learners can see how the numbers and the note move each answer.
// These numbers are NOT produced by JEV.
const normalize = (raw) => { const s = Object.values(raw).reduce((a, b) => a + b, 0); return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, +(v / s).toFixed(3)])); };
const top = (probs) => Object.entries(probs).sort((a, b) => b[1] - a[1])[0];
const choiceAnswer = (raw) => { const probabilities = normalize(raw); const [choice, confidence] = top(probabilities); return { type: 'choice', choice, confidence, probabilities }; };
function scoreAnswer(target, levels) {
  const w = Array.from({ length: levels }, (_, i) => Math.exp(-((i - target) ** 2)));
  const sum = w.reduce((a, b) => a + b, 0);
  const sp = w.map(x => x / sum);
  return { type: 'score', score: +sp.reduce((n, p, i) => n + p * i, 0).toFixed(2), confidence: +Math.max(...sp).toFixed(3), probabilities: Object.fromEntries(sp.map((p, i) => [i, +p.toFixed(3)])) };
}
const clamp = (v, lo, hi) => +Math.min(hi, Math.max(lo, v)).toFixed(2);

function demoAnswers(note, extra) {
  const found = noteSignals(note);
  const k = found.length;
  const e = current;
  const ratio = e.locationQuotient;
  const answers = {
    market_pattern: choiceAnswer({ crowded: .12 + Math.max(0, ratio - 1) * 3, relatively_sparse: .12 + Math.max(0, 1 - ratio) * 3, mixed: Math.max(.1, .6 - Math.abs(ratio - 1) * 2), insufficient: k === 0 ? .6 : k === 1 ? .25 : .08 }),
    visit_priority: scoreAnswer(Math.min(3, k * .6 + (Math.abs(ratio - 1) > .15 ? .8 : .3)), 4),
    needs_more_evidence: { type: 'noul', noul: clamp(.95 - .1 * k, .35, .95) }
  };
  // Industry-mix rule for the overall character of the district.
  const sp = Object.fromEntries(e.specialized.map(s => [s.name, s.lq]));
  const has = (...names) => names.reduce((n, x) => n + (sp[x] ? sp[x] - 1 : 0), 0);
  answers.commercial_character = choiceAnswer({ residential_life: .15 + has('소매', '수리·개인', '보건의료'), office_business: .15 + has('과학·기술', '부동산', '시설관리·임대'), tourism_food: .15 + has('숙박', '음식', '예술·스포츠'), education_family: .15 + has('교육'), mixed_balanced: .15 + Math.max(0, e.mixDiversity - .75) * 3 + (e.specialized.length ? 0 : .5) });
  answers.entry_risk_focus = choiceAnswer({ oversupply: .1 + Math.max(0, ratio - 1) * 2, demand_unclear: .1 + Math.max(0, 1 - ratio) * 2, cost_unknown: found.includes('임대료') ? .05 : .35, customer_mismatch: found.includes('고객층') ? .2 : .1, info_gap: k <= 1 ? .5 : .05 });
  const saysCrowded = /많|밀집|경쟁/.test(note), saysSparse = /적|없|부족/.test(note);
  answers.hypothesis_fit = { type: 'noul', noul: clamp(saysCrowded && ratio > 1 || saysSparse && ratio < 1 ? .7 : saysCrowded || saysSparse ? .3 : .25, 0, 1) };
  answers.differentiation_needed = { type: 'noul', noul: clamp(.5 + (ratio - 1) * 1.5, .1, .95) };
  // Criteria and scan: the visible baseline plus a fixed per-district offset, so some cross-checks disagree on purpose.
  if (packs.has('criteria')) {
    const exp = expectedScores(e);
    const seed = [...e.region].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) % 997, 7);
    CRITERIA.forEach((c, i) => {
      const base = exp[c.key]?.value ?? (e.specialized.some(x => x.name === e.industry) || e.topIndustries.some(x => x.name === e.industry) ? 3 : 2);
      const offset = ((seed * (i + 3)) % 29) / 10 - 1.4;
      answers[c.key] = scoreAnswer(Math.min(4, Math.max(0, base + (c.key === 'data_confidence' ? 0 : offset))), 5);
    });
  }
  if (packs.has('scan')) e.industryTable.forEach(r => {
    answers[scanKey(r.code)] = scoreAnswer(Math.min(4, Math.max(0, 2 + (1 - r.locationQuotient) * 3 + (1 - r.nationalLocationQuotient))), 5);
  });
  if (e.candidates.length) {
    const opts = [{ share: e.districtShare, lq: ratio }, ...e.candidates.map(c => ({ share: c.share, lq: c.locationQuotient }))];
    answers.first_visit = choiceAnswer(Object.fromEntries(opts.map((o, i) => [`c${i}`, .2 + Math.abs(o.lq - 1) + (i === 0 ? .1 : 0)])));
  }
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
  showResult(demoAnswers(note, extra), true, { model: 'example-only', state: { ...current, entrepreneur_note: note }, questions: allQuestions() }, extra);
  $('status').textContent = `예시 값은 입지계수·순위·업종 구성과 메모 속 근거 ${noteSignals(note).length}종으로 만든 규칙입니다. 메모를 바꿔 다시 눌러 보세요. 실제 JEV 분석은 API 키가 필요합니다.`;
}

async function analyze() {
  const note = $('note').value.trim();
  const key = $('apiKey').value.trim();
  if (note.length < 10) { $('status').textContent = '창업 메모를 10자 이상 입력해 주세요.'; $('note').focus(); return; }
  if (!key) { $('status').textContent = '실제 분석에는 JEV API 키가 필요합니다. 키 없이 예시 보기도 가능합니다.'; $('apiKey').focus(); return; }
  const extra = getExtraQuestion();
  $('analyze').disabled = true;
  const list = [...packs];
  $('status').textContent = `JEV에 분석 묶음 ${list.length}개(질문 ${Object.keys(allQuestions()).length}개)를 동시에 보내고 있습니다…`;
  try {
    // One request per pack, in parallel. A failed pack is reported without discarding the others.
    const results = await Promise.all(list.map(async pack => {
      try {
        const res = await fetch('/api/jev/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: key, evidence: current, note, pack, extraQuestion: pack === 'core' ? extra : undefined }) });
        const data = await res.json().catch(() => ({}));
        return res.ok ? { pack, data } : { pack, error: data.error || `HTTP ${res.status}` };
      } catch { return { pack, error: '연결 실패' }; }
    }));
    const ok = results.filter(r => r.data);
    if (!ok.length) throw new Error(results[0].error || '분석에 실패했습니다.');
    const answers = Object.assign({}, ...ok.map(r => r.data.answers));
    showResult(answers, false, ok.map(r => ({ pack: r.pack, ...r.data.requestBody })), extra);
    const failed = results.filter(r => r.error);
    $('status').textContent = failed.length
      ? `일부 묶음이 실패했습니다: ${failed.map(r => `${PACKS[r.pack].name}(${r.error})`).join(', ')}. 받은 결과만 표시합니다.`
      : '실제 JEV 응답을 받았습니다. 아래에서 Gemini가 결과를 확인하고 풀어 줍니다.';
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
  const cc = r.answers.commercial_character?.choice;
  const comp = composite(r.answers, r.weights ?? DEFAULT_WEIGHTS);
  return [
    `${r.evidence.region} · ${r.evidence.industry}`, percent(r.evidence.districtShare), percent(r.evidence.provinceShare),
    `${labels[c.choice] ?? c.choice ?? '—'} (${Number.isFinite(Number(c.confidence)) ? percent(Number(c.confidence)) : '—'})`,
    Number.isFinite(Number(s.score)) ? Number(s.score).toFixed(2) : '—', Number.isFinite(n) ? percent(n) : '—',
    cc ? CHOICE_LABELS.commercial_character[cc] ?? cc : '—', comp ? `${Math.round(comp.value * 100)}${comp.sd != null ? ` ±${Math.round(comp.sd * 100)}` : ''}` : '—',
    extraSummary(r), r.demo ? '예시' : 'JEV'
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
  const head = ['번호', '지역 · 업종', '지역 비중', '시도 비중', '상권 특성', '조사 우선순위', '추가 근거 필요', '상권 성격', '현장 조사 매력도', '직접 만든 질문', '방식'];
  const esc = (v) => /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  const lines = [head, ...memoryBoard.map((r, i) => [String(i + 1), ...rowCells(r)])].map(r => r.map(esc).join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = el('a', { href: URL.createObjectURL(blob), download: 'jev-비교보드.csv' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function initPacks() {
  $('packList').replaceChildren(...Object.entries(PACKS).map(([key, p]) => {
    const box = el('input', { type: 'checkbox', checked: packs.has(key), disabled: key === 'core' });
    box.addEventListener('change', () => { box.checked ? packs.add(key) : packs.delete(key); $('results').hidden = true; $('consult').hidden = true; updatePreview(); });
    const n = Object.keys(buildPack(current, key)).length;
    return el('label', { className: 'pack' }, box, el('span', {}, el('b', { textContent: `${p.name} ` }), el('small', { textContent: `${p.desc} · ${key === 'core' ? '7~8' : n}문항${key === 'core' ? ' · 항상 포함' : ''}` })));
  }));
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
  initPacks();
  updateNote();
  $('sido').addEventListener('change', updateDistricts);
  $('district').addEventListener('change', showEvidence);
  $('industry').addEventListener('change', showEvidence);
  $('cand1').addEventListener('change', showEvidence);
  $('cand2').addEventListener('change', showEvidence);
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
  saveBoard([...memoryBoard, { ...lastResult, weights: { ...weights } }]);
  renderBoard();
  $('saveResult').disabled = true;
  $('saveResult').firstChild.textContent = `저장됨 (${memoryBoard.length}번) `;
});
$('exportCsv').addEventListener('click', exportCsv);
$('clearBoard').addEventListener('click', () => { if (confirm('비교 보드의 결과를 모두 지울까요?')) { saveBoard([]); renderBoard(); } });
renderBoard();
