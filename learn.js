// Learning widgets: spreadsheet demo, question-type explorer, concept quiz.
const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
};
const pct = (n) => (n * 100).toFixed(0) + '%';

function initSheetDemo() {
  $('sheetFill').addEventListener('click', () => {
    document.querySelectorAll('.sheet-demo td[data-fill]').forEach((td, i) => {
      setTimeout(() => {
        td.textContent = td.dataset.fill;
        td.classList.add(td.dataset.fill.startsWith('??') ? 'bad' : 'good');
      }, i * 120);
    });
    $('sheetFill').textContent = '대화형 답은 칸마다 해석이 필요합니다';
    $('sheetFill').disabled = true;
  });
}

// Each explorer keeps its own practice numbers and redraws an interpretation from them.
const explorers = {
  choice: {
    intro: '선택지 중 하나를 고르고, 선택지마다 확률을 붙입니다. 가장 높은 확률이 choice, 그 값이 confidence입니다.',
    values: { crowded: 60, mixed: 25, relatively_sparse: 10, insufficient: 5 },
    names: { crowded: '상대적으로 밀집', mixed: '혼합 신호', relatively_sparse: '상대적으로 적음', insufficient: '근거 부족' },
    read(v) {
      const total = Object.values(v).reduce((a, b) => a + b, 0) || 1;
      const probs = Object.entries(v).map(([k, x]) => [k, x / total]).sort((a, b) => b[1] - a[1]);
      const [[top, p1], [second, p2]] = probs;
      const gap = p1 - p2;
      const msg = gap < .1 ? `1위와 2위의 차이가 ${pct(gap)}p뿐입니다. “${this.names[top]}”라고 단정하기보다 “${this.names[second]}” 가능성도 함께 조사하세요.`
        : p1 > .7 ? `“${this.names[top]}” 쪽으로 뚜렷하게 기울었습니다. 그래도 창업 성공 확률이 아니라 상권 분류에 대한 확신입니다.`
        : `“${this.names[top]}”가 가장 유력하지만 다른 선택지도 ${pct(1 - p1)} 남아 있습니다.`;
      return { json: { type: 'choice', choice: top, confidence: +p1.toFixed(2), probabilities: Object.fromEntries(probs.map(([k, p]) => [k, +p.toFixed(2)])) }, msg, bars: probs.map(([k, p]) => [this.names[k], p, k === top]) };
    }
  },
  score: {
    intro: '0부터 3까지 순서가 있는 단계에 확률을 나눕니다. 여기서는 “현장 조사 우선순위”이며, 단계별 확률로 가중 평균을 내 보면 점수가 어디쯤인지 감이 옵니다.',
    values: { 0: 10, 1: 25, 2: 50, 3: 15 },
    names: { 0: '0 낮음', 1: '1 보통', 2: '2 높음', 3: '3 매우 높음' },
    read(v) {
      const total = Object.values(v).reduce((a, b) => a + b, 0) || 1;
      const probs = Object.entries(v).map(([k, x]) => [k, x / total]);
      const mean = probs.reduce((n, [k, p]) => n + Number(k) * p, 0);
      const spread = Math.sqrt(probs.reduce((n, [k, p]) => n + p * (Number(k) - mean) ** 2, 0));
      const msg = spread > 1 ? `가중 평균은 ${mean.toFixed(2)}이지만 확률이 여러 단계에 퍼져 있습니다(표준편차 ${spread.toFixed(2)}). 평균 점수만 보고 판단하지 마세요.`
        : `가중 평균은 ${mean.toFixed(2)}이고 확률이 비교적 한 곳에 모여 있습니다(표준편차 ${spread.toFixed(2)}).`;
      return { json: { type: 'score', score: +mean.toFixed(2), probabilities: Object.fromEntries(probs.map(([k, p]) => [k, +p.toFixed(2)])) }, msg, bars: probs.map(([k, p]) => [this.names[k], p, false]) };
    }
  },
  noul: {
    intro: '예/아니요 질문에 “예”일 확률 하나를 돌려줍니다. 여기서는 “창업 판단 전에 추가 조사가 필요한가?”입니다.',
    values: { yes: 90 },
    names: { yes: '예일 확률' },
    read(v) {
      const p = v.yes / 100;
      const msg = p >= .8 ? '“예” 쪽으로 강하게 기울었습니다. 추가 조사가 필요하다는 뜻이지, 성공률 90%라는 뜻이 아닙니다.'
        : p <= .2 ? '“아니요” 쪽으로 기울었습니다. 메모에 근거가 충분하다고 본 것이지만 현장 확인은 여전히 필요합니다.'
        : '0.5 근처는 JEV도 판단이 어렵다는 신호입니다. 질문이나 메모를 더 구체적으로 바꿔 보세요.';
      return { json: { type: 'noul', noul: +p.toFixed(2) }, msg, bars: [['예', p, p >= .5], ['아니요', 1 - p, p < .5]] };
    }
  }
};

function drawExplorer(type) {
  const ex = explorers[type];
  const panel = $('typePanel');
  const sliders = el('div', { className: 'sliders' });
  const output = el('div', { className: 'type-output' });
  const redraw = () => {
    const r = ex.read(ex.values);
    output.replaceChildren(
      el('div', { className: 'dist' }, ...r.bars.map(([name, p, top]) => el('div', { className: top ? 'top' : '' },
        el('span', { textContent: name }), el('div', { className: 'track' }, Object.assign(el('i'), { style: `width:${(p * 100).toFixed(1)}%` })), el('b', { textContent: pct(p) })))),
      el('p', { className: 'insight', textContent: r.msg }),
      el('pre', { className: 'mini-json', textContent: JSON.stringify(r.json, null, 2) })
    );
  };
  for (const key of Object.keys(ex.values)) {
    const input = el('input', { type: 'range', min: 0, max: 100, value: ex.values[key] });
    input.setAttribute('aria-label', ex.names[key]);
    input.addEventListener('input', () => { ex.values[key] = Number(input.value); redraw(); });
    sliders.append(el('label', {}, el('span', { textContent: ex.names[key] }), input));
  }
  if (type !== 'noul') sliders.append(el('p', { className: 'helper', textContent: '슬라이더 값은 합계가 1이 되도록 자동으로 나눠 계산합니다.' }));
  panel.replaceChildren(el('p', { className: 'type-intro', textContent: ex.intro }), el('div', { className: 'type-body' }, sliders, output));
  redraw();
}

function initTypes() {
  const tabs = document.querySelectorAll('.type-tabs button');
  tabs.forEach(tab => tab.addEventListener('click', () => {
    tabs.forEach(t => t.setAttribute('aria-selected', String(t === tab)));
    drawExplorer(tab.dataset.type);
  }));
  drawExplorer('choice');
}

const quiz = [
  { q: '시군구 음식 업종 2,000곳, 전체 점포 20,000곳입니다. 음식 업종 비중은?', options: ['2%', '10%', '20%', '알 수 없다'], answer: 1, why: '2,000 ÷ 20,000 = 0.1 = 10%입니다. 분모는 인구가 아니라 전체 점포 수입니다.' },
  { q: '지역 비중 10%, 시도 비중 8%입니다. 두 값의 차이를 바르게 말한 것은?', options: ['2% 높다', '2%p 높다', '2배 높다', '20%p 높다'], answer: 1, why: '비율끼리의 뺄셈은 퍼센트포인트(%p)입니다. 상대적으로 보면 25% 높은 것이므로 “2% 높다”는 틀린 표현입니다.' },
  { q: 'Noul “추가 조사가 필요한가?”의 값이 0.9입니다. 올바른 해석은?', options: ['창업 성공률 90%', '이 지역 점포의 90%가 경쟁점', '추가 조사가 필요하다는 “예” 응답값이 0.9', '10% 확률로 실패'], answer: 2, why: 'Noul은 정해 둔 예/아니요 질문에 대한 “예” 값입니다. 질문이 무엇이었는지 함께 읽어야 합니다.' },
  { q: 'Choice 결과가 crowded 0.41, mixed 0.38입니다. 가장 알맞은 태도는?', options: ['밀집 지역이 확실하다', '두 가능성 모두 조사한다', 'JEV가 틀렸으니 무시한다', '확률은 중요하지 않다'], answer: 1, why: '1위와 2위의 차이가 작으면 확률 분포가 불확실성을 알려 주는 것입니다. 확률을 볼 수 있다는 점이 구조화된 답의 장점입니다.' },
  { q: '일반 대화형 답변과 비교해 JEV 구조화 답변의 장점이 아닌 것은?', options: ['정해진 선택지 안에서만 답한다', '여러 지역 결과를 한 표로 모으기 쉽다', '현장 조사 없이 창업 여부를 확정해 준다', '선택지별 확률을 함께 받는다'], answer: 2, why: 'JEV는 우리가 설계한 질문에 구조화된 답을 줄 뿐, 현장 조사나 실제 매출 자료를 대신하지 않습니다.' },
  { q: '다음 중 이 앱의 상권 데이터에 들어 있는 것은?', options: ['업종별 점포 수', '월 매출', '유동인구', '임대료'], answer: 0, why: '2026년 6월 상가업소 목록을 센 점포 수입니다. 매출·유동인구·임대료는 현장이나 다른 자료로 확인해야 합니다.' },
  { q: 'Score 질문에서 “0~3단계”를 정한 사람은 누구인가요?', options: ['JEV가 스스로 정한다', '질문을 설계한 사람', '공공데이터 제공 기관', '정해져 있지 않다'], answer: 1, why: '질문의 유형, 지시문, 단계 기준(criteria)은 모두 요청하는 사람이 정합니다. “질문 설계” 단계에서 직접 만들어 보세요.' },
  { q: '입지계수가 1.4입니다. 올바른 해석은?', options: ['매출이 시도 평균의 1.4배', '이 업종의 점포 비중이 시도보다 1.4배 높다', '창업 성공 확률 140%', '점포가 1.4곳 있다'], answer: 1, why: '입지계수 = 시군구 업종 비중 ÷ 시도 업종 비중입니다. 1보다 크면 그 업종이 상대적으로 몰려 있다는 뜻이며 매출과는 무관합니다.' },
  { q: 'JEV 결과를 Gemini에게 넘겨 상담을 받을 때 가장 좋은 읽기 방법은?', options: ['Gemini 글이 자연스러우면 그대로 믿는다', '글 속 주장이 어떤 숫자·JEV 확률에 기대는지 확인한다', 'JEV 확률은 무시하고 글만 읽는다', '상담 글이 있으면 현장 조사는 필요 없다'], answer: 1, why: 'JEV가 먼저 판단을 구조화해 두었기 때문에, Gemini의 문장이 어떤 근거에서 나왔는지 추적할 수 있습니다. 그럴듯한 문장과 근거 있는 문장을 구별하세요.' }
];

function initQuiz() {
  const answered = new Map();
  const update = () => {
    const correct = [...answered.values()].filter(Boolean).length;
    $('quizScore').textContent = `${correct} / ${quiz.length}`;
    $('quizMessage').textContent = answered.size < quiz.length ? `${quiz.length - answered.size}문제가 남았습니다.`
      : correct === quiz.length ? '모두 맞혔습니다! 이제 실습실에서 직접 JEV 결과를 해석해 보세요.'
      : '틀린 문제의 설명을 다시 읽고 실습실에서 숫자를 직접 확인해 보세요.';
  };
  const render = () => {
    answered.clear();
    $('quizList').replaceChildren(...quiz.map((item, qi) => {
      const feedback = el('p', { className: 'feedback' });
      const buttons = item.options.map((text, oi) => {
        const b = el('button', { textContent: text });
        b.addEventListener('click', () => {
          if (answered.has(qi)) return;
          const ok = oi === item.answer;
          answered.set(qi, ok);
          buttons.forEach((x, i) => { x.disabled = true; if (i === item.answer) x.className = 'right'; });
          if (!ok) b.className = 'wrong';
          feedback.textContent = (ok ? '정답! ' : '다시 생각해 봐요. ') + item.why;
          feedback.className = 'feedback ' + (ok ? 'ok' : 'no');
          update();
        });
        return b;
      });
      return el('article', { className: 'card quiz-item' }, el('small', { textContent: `Q${qi + 1}` }), el('h3', { textContent: item.q }), el('div', { className: 'options' }, ...buttons), feedback);
    }));
    update();
  };
  $('quizReset').addEventListener('click', render);
  render();
}

initSheetDemo();
initTypes();
initQuiz();
