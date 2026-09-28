const $ = (id) => document.getElementById(id);
const labels = { crowded: '상대적으로 밀집', relatively_sparse: '상대적으로 적음', mixed: '혼합 신호', insufficient: '근거 부족' };
const description = {
  crowded: '점포 비중이 높은 편입니다. 경쟁점의 고객층과 차별점을 현장에서 확인하세요.',
  relatively_sparse: '점포 비중이 낮은 편입니다. 공급 공백인지 수요 부족인지 확인하세요.',
  mixed: '숫자와 메모를 함께 해석하기 어렵습니다. 비교 지역을 추가해 보세요.',
  insufficient: '비교 숫자 외에 수요와 입지에 관한 정보가 더 필요합니다.'
};
let market;
let current;
const number = (n) => n.toLocaleString('ko-KR');
const percent = (n) => (n * 100).toFixed(1) + '%';

function selectOptions(select, entries) {
  select.replaceChildren(...entries.map(([value, text]) => {
    const option = document.createElement('option');
    option.value = value; option.textContent = text;
    return option;
  }));
}

function selectedEvidence() {
  const d = market.districts.find(x => x.code === $('district').value);
  if (!d) return null;
  const industry = $('industry').value;
  const peers = market.districts.filter(x => x.sido === d.sido);
  const districtCount = d.counts[industry] || 0;
  const districtTotal = Object.values(d.counts).reduce((a, b) => a + b, 0);
  const provinceCount = peers.reduce((n, x) => n + (x.counts[industry] || 0), 0);
  const provinceTotal = peers.reduce((n, x) => n + Object.values(x.counts).reduce((a, b) => a + b, 0), 0);
  return { region: `${market.sidos[d.sido]} ${d.name}`, industry: market.industries[industry],
    districtCount, districtTotal, provinceCount, provinceTotal,
    districtShare: districtCount / districtTotal, provinceShare: provinceCount / provinceTotal };
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
  $('results').hidden = true;
  $('status').textContent = '';
}

function updateDistricts() {
  const entries = market.districts.filter(x => x.sido === $('sido').value).map(x => [x.code, x.name]);
  selectOptions($('district'), entries);
  showEvidence();
}

function card(type, title, body, value) {
  const item = document.createElement('article');
  const small = document.createElement('small'); small.textContent = type;
  const heading = document.createElement('h3'); heading.textContent = title;
  const paragraph = document.createElement('p'); paragraph.textContent = body;
  item.append(small, heading, paragraph);
  if (Number.isFinite(value)) {
    const bar = document.createElement('div'); bar.className = 'prob';
    const fill = document.createElement('i'); fill.style.width = `${Math.min(100, Math.max(0, value * 100))}%`;
    bar.append(fill);
    const foot = document.createElement('p'); foot.textContent = `응답값 ${percent(value)} · 창업 성공률이 아닙니다`;
    item.append(bar, foot);
  }
  return item;
}

function showResult(answers, isDemo, requestBody) {
  const choice = answers.market_pattern ?? {};
  const score = answers.visit_priority ?? {};
  const noul = answers.needs_more_evidence ?? {};
  const choiceName = labels[choice.choice] ?? String(choice.choice ?? '해석 불가');
  const scoreValue = Number(score.score);
  const yes = Number(noul.noul);
  $('resultCards').replaceChildren(
    card('CHOICE · 선택', choiceName, description[choice.choice] ?? '선택지를 확인해 주세요.', Number(choice.confidence)),
    card('SCORE · 순서 있는 단계', Number.isFinite(scoreValue) ? `${scoreValue.toFixed(2)} / 3` : '응답 확인', '현장 조사 우선순위의 단계 점수입니다. 높은 점수도 투자 권고가 아닙니다.', Number(score.confidence)),
    card('NOUL · 예/아니요', Number.isFinite(yes) ? percent(yes) : '응답 확인', '추가 근거가 필요할 가능성에 대한 JEV의 응답입니다.', yes)
  );
  $('modeBadge').textContent = isDemo ? '예시 결과' : 'JEV 실제 응답';
  $('modeBadge').className = isDemo ? 'badge demo' : 'badge';
  $('modeLabel').textContent = isDemo ? '규칙으로 만든 화면 예시입니다. JEV 호출이나 실제 AI 판단이 아닙니다.' : 'TypeSafe JEV 응답입니다. 수치와 판단을 분리해 읽어 보세요.';
  $('raw').textContent = JSON.stringify({ requestBody, answers }, null, 2);
  $('results').hidden = false;
  $('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function demo() {
  if (!$('note').value.trim()) $('note').value = '역 앞에 점포가 많은데 고객 수요가 있을지 궁금합니다. 임대료와 시간대별 유동인구를 현장에서 확인하고 싶어요.';
  const ratio = current.districtShare / Math.max(current.provinceShare, .00001);
  const category = ratio > 1.15 ? 'crowded' : ratio < .85 ? 'relatively_sparse' : 'mixed';
  const score = ratio > 1.15 ? 2 : 1;
  const answers = {
    market_pattern: { type: 'choice', choice: category, confidence: .65, probabilities: { crowded: category === 'crowded' ? .65 : .12, relatively_sparse: category === 'relatively_sparse' ? .65 : .12, mixed: category === 'mixed' ? .65 : .12, insufficient: .11 } },
    visit_priority: { type: 'score', score, confidence: .6, probabilities: { 0: .1, 1: .25, 2: .55, 3: .1 } },
    needs_more_evidence: { type: 'noul', noul: .9 }
  };
  showResult(answers, true, { model: 'example-only', state: { ...current, entrepreneur_note: $('note').value }, questions: '질문 정의는 netlify/functions/jev-analyze.mjs 참고' });
  $('status').textContent = '예시 숫자는 수업용으로 임의 지정했습니다. 실제 JEV 분석은 API 키를 입력하고 실행하세요.';
}

async function analyze() {
  const note = $('note').value.trim();
  const key = $('apiKey').value.trim();
  if (note.length < 10) { $('status').textContent = '창업 메모를 10자 이상 입력해 주세요.'; $('note').focus(); return; }
  if (!key) { $('status').textContent = '실제 분석에는 JEV API 키가 필요합니다. 키 없이 예시 보기도 가능합니다.'; $('apiKey').focus(); return; }
  $('analyze').disabled = true;
  $('status').textContent = 'JEV에 질문을 보내고 있습니다…';
  try {
    const res = await fetch('/api/jev/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: key, evidence: current, note }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '분석에 실패했습니다.');
    showResult(data.answers, false, data.requestBody);
    $('status').textContent = '실제 JEV 응답을 받았습니다.';
  } catch (error) {
    $('status').textContent = error instanceof Error ? error.message : '잠시 후 다시 시도해 주세요.';
  } finally { $('analyze').disabled = false; }
}

try {
  const response = await fetch('data/market.json');
  if (!response.ok) throw new Error('상권 데이터 파일을 불러올 수 없습니다.');
  market = await response.json();
  selectOptions($('sido'), Object.entries(market.sidos));
  selectOptions($('industry'), Object.entries(market.industries));
  $('sido').value = '11'; $('industry').value = 'I2';
  updateDistricts();
  $('sido').addEventListener('change', updateDistricts);
  $('district').addEventListener('change', showEvidence);
  $('industry').addEventListener('change', showEvidence);
  $('demo').addEventListener('click', demo);
  $('analyze').addEventListener('click', analyze);
} catch (error) {
  $('evidenceTitle').textContent = '데이터를 읽지 못했습니다';
  $('status').textContent = error.message;
}
