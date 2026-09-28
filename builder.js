// Question builder: learners design one extra JEV question and see the same type checks the server runs.
import { validateQuestion } from './shared/question-schema.mjs';

const $ = (id) => document.getElementById(id);
const listeners = new Set();
let valid = false;

const presets = {
  choice: { key: 'competition_style', instructions: '메모와 점포 비중을 보고 이 지역 경쟁점이 주로 어떤 방식으로 경쟁할지 고르세요.',
    criteria: [['price', '가격이 저렴한 가게가 주로 경쟁함'], ['quality', '맛·품질·전문성으로 경쟁함'], ['convenience', '위치와 영업시간 등 편의성으로 경쟁함'], ['unclear', '주어진 정보로는 판단하기 어려움']] },
  score: { key: 'access_readiness', instructions: '메모에 적힌 입지 정보만 보고 고객 접근성 조사가 얼마나 준비되었는지 평가하세요.',
    criteria: [['', '입지 정보가 거의 없음'], ['', '대략적인 위치만 있음'], ['', '교통·동선 중 하나를 구체적으로 적음'], ['', '교통·동선·시간대를 모두 구체적으로 적음']] },
  noul: { key: 'rent_checked', instructions: '창업 메모에 임대료나 보증금을 이미 확인했다는 내용이 있습니까?',
    criteria: [['true', '임대료·보증금을 확인한 내용이 있음'], ['false', '임대료·보증금 정보가 없음']] }
};

const labels = {
  choice: ['선택지와 기준', '선택지 키(영어)와 판단 기준을 적습니다. 2~8개.'],
  score: ['단계 기준 (낮음 → 높음)', '위에서부터 0, 1, 2… 단계입니다. 2~6개.'],
  noul: ['예/아니요 기준', 'true는 “예”, false는 “아니요”일 때의 기준입니다.']
};

function row(type, index, key = '', desc = '') {
  const wrap = document.createElement('div');
  wrap.className = 'criterion';
  const k = document.createElement('input');
  k.className = 'c-key';
  if (type === 'choice') { k.value = key; k.placeholder = 'option_key'; }
  else { k.value = type === 'score' ? String(index) : key; k.readOnly = true; k.tabIndex = -1; }
  const d = document.createElement('input');
  d.className = 'c-desc'; d.value = desc; d.placeholder = '판단 기준을 적어 주세요';
  wrap.append(k, d);
  if (type !== 'noul') {
    const del = document.createElement('button');
    del.type = 'button'; del.textContent = '×'; del.setAttribute('aria-label', '항목 삭제');
    del.addEventListener('click', () => { wrap.remove(); renumber(); refresh(); });
    wrap.append(del);
  }
  return wrap;
}

function renumber() {
  if ($('qType').value === 'score') $('criteria').querySelectorAll('.c-key').forEach((k, i) => { k.value = String(i); });
}

function setCriteria(type, items) {
  $('criteria').replaceChildren(...items.map(([k, d], i) => row(type, i, k, d)));
  $('criteriaLabel').textContent = labels[type][0];
  $('criteriaHelp').textContent = labels[type][1];
  $('addCriterion').hidden = type === 'noul';
}

function readQuestion() {
  const type = $('qType').value;
  const rows = [...$('criteria').querySelectorAll('.criterion')].map(r => [r.querySelector('.c-key').value.trim(), r.querySelector('.c-desc').value.trim()]);
  const criteria = type === 'score' ? rows.map(([, d]) => d) : Object.fromEntries(rows);
  return { key: $('qKey').value.trim(), definition: { type, instructions: $('qInstructions').value.trim(), criteria } };
}

function refresh() {
  const { key, definition } = readQuestion();
  const errors = validateQuestion(key, definition);
  if (definition.type === 'choice') {
    const keys = [...$('criteria').querySelectorAll('.c-key')].map(k => k.value.trim());
    if (new Set(keys).size !== keys.length) errors.push('선택지 키가 겹칩니다. 서로 다른 키를 써 주세요.');
  }
  valid = errors.length === 0;
  const checks = valid ? [['ok', '형식 검사를 통과했습니다. JEV에 보낼 수 있는 질문입니다.']] : errors.map(e => ['no', e]);
  $('checks').replaceChildren(...checks.map(([cls, text]) => { const li = document.createElement('li'); li.className = cls; li.textContent = text; return li; }));
  $('qJson').textContent = JSON.stringify({ questions: { [key || '(질문 키)']: definition } }, null, 2);
  $('useExtra').disabled = !valid;
  if (!valid) $('useExtra').checked = false;
  listeners.forEach(fn => fn());
}

function load(type) {
  const p = presets[type];
  $('qType').value = type; $('qKey').value = p.key; $('qInstructions').value = p.instructions;
  setCriteria(type, p.criteria);
  refresh();
}

export function getExtraQuestion() {
  return valid && $('useExtra').checked ? readQuestion() : null;
}
export function onExtraChange(fn) { listeners.add(fn); }

$('qType').addEventListener('change', () => {
  const type = $('qType').value;
  setCriteria(type, type === 'noul' ? [['true', ''], ['false', '']] : [['', ''], ['', '']]);
  refresh();
});
$('addCriterion').addEventListener('click', () => {
  const type = $('qType').value;
  $('criteria').append(row(type, $('criteria').children.length));
  refresh();
});
document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => load(b.dataset.preset)));
$('builder').addEventListener('input', refresh);
$('useExtra').addEventListener('change', refresh);
load('choice');
