// JEV question set used by the server request and by the browser to label answers.
// Keeping them in one place means the UI always explains exactly what JEV was asked.
export const CHOICE_LABELS = {
  market_pattern: { crowded: '상대적으로 밀집', relatively_sparse: '상대적으로 적음', mixed: '혼합 신호', insufficient: '근거 부족' },
  commercial_character: { residential_life: '주거 생활형', office_business: '업무·전문서비스형', tourism_food: '관광·외식형', education_family: '교육·가족형', mixed_balanced: '고르게 섞인 복합형' },
  entry_risk_focus: { oversupply: '경쟁 과밀', demand_unclear: '수요 불확실', cost_unknown: '비용 미확인', customer_mismatch: '고객층 불일치', info_gap: '정보 부족' }
};
export const SCORE_LEVELS = {
  visit_priority: ['낮음', '보통', '높음', '매우 높음']
};
const FIVE = ['매우 낮음', '낮음', '보통', '높음', '매우 높음'];

// Multi-criteria pack: each criterion is judged by JEV from public data only, on the same 0~4 scale.
// direction +1 means a higher score makes the area more worth a field visit; -1 means the opposite.
// data_confidence is not blended into the composite; it tells how much to trust the others.
export const CRITERIA = [
  { key: 'competition_pressure', name: '경쟁 압력', direction: -1, fields: 'locationQuotient, nationalLocationQuotient, rankInProvince/districtsInProvince, districtCount',
    instructions: '선택 업종의 경쟁 압력을 평가하세요. 입지계수(시도·전국 대비)가 1보다 클수록, 시도 안 순위가 높을수록, 점포 수가 많을수록 압력이 큽니다.',
    levels: ['매우 낮음: 입지계수·순위·점포 수 모두 평균보다 뚜렷이 낮음', '낮음: 대체로 평균보다 낮음', '보통: 평균과 비슷하거나 신호가 엇갈림', '높음: 대체로 평균보다 높음', '매우 높음: 입지계수·순위·점포 수 모두 뚜렷이 높음'] },
  { key: 'supply_gap', name: '공급 여지', direction: 1, fields: 'locationQuotient, nationalLocationQuotient, scaleIndex, districtTotal',
    instructions: '상권 전체 규모에 비해 선택 업종 점포가 적어 새 점포가 들어갈 공급 여지가 얼마나 되는지 평가하세요. 입지계수가 낮고 규모 지수가 클수록 여지가 큽니다. 입지계수가 높으면 여지가 작습니다.',
    levels: ['매우 작음: 이미 업종 비중이 매우 높음', '작음: 업종 비중이 평균보다 높음', '보통: 평균 수준', '큼: 비중이 평균보다 낮고 상권이 작지 않음', '매우 큼: 비중이 뚜렷이 낮고 상권 규모가 큼'] },
  { key: 'demand_signal', name: '연관 수요 신호', direction: 1, fields: 'relatedIndustries(연관 업종의 입지계수), specialized',
    instructions: 'relatedIndustries는 선택 업종의 손님을 끌어올 수 있는 연관 업종입니다(교육용 가정). 연관 업종의 입지계수가 1보다 클수록 간접 수요 신호가 강합니다. 이 신호의 세기를 평가하세요.',
    levels: ['매우 약함: 연관 업종이 모두 평균보다 뚜렷이 적음', '약함: 대체로 평균보다 적음', '보통: 평균 수준이거나 엇갈림', '강함: 대체로 평균보다 많음', '매우 강함: 연관 업종이 뚜렷이 특화됨'] },
  { key: 'market_scale', name: '상권 규모', direction: 1, fields: 'scaleIndex, districtTotal, provinceTotal/districtsInProvince',
    instructions: '시군구 전체 점포 수로 본 상권의 규모를 평가하세요. 규모 지수 1은 시도 안 시군구 평균입니다.',
    levels: ['매우 작음: 규모 지수 0.5 미만 수준', '작음: 평균보다 작음', '보통: 평균 수준', '큼: 평균보다 큼', '매우 큼: 규모 지수 2 이상 수준'] },
  { key: 'mix_stability', name: '업종 다양성', direction: 1, fields: 'mixDiversity, topIndustries, specialized',
    instructions: '업종이 고르게 섞여 한 업종 경기에 덜 흔들리는 상권인지 평가하세요. mixDiversity(0~1)가 높고 상위 업종 편중이 낮을수록 높게 평가합니다.',
    levels: ['매우 낮음: 한두 업종에 크게 편중', '낮음: 편중이 뚜렷함', '보통: 약간 편중', '높음: 대체로 고르게 섞임', '매우 높음: 매우 고르게 섞임'] },
  { key: 'industry_fit', name: '업종-상권 궁합', direction: 1, fields: 'industry, topIndustries, specialized, industryTable',
    instructions: '이 시군구의 업종 구성(상위·특화 업종)으로 본 상권 성격과 선택 업종이 얼마나 잘 어울리는지 평가하세요. 예: 관광·숙박 특화 지역의 음식업, 주거 생활 업종이 많은 지역의 교육업은 궁합이 좋습니다.',
    levels: ['매우 낮음: 상권 성격과 거의 맞지 않음', '낮음: 잘 맞지 않음', '보통: 판단하기 어려움', '높음: 잘 어울림', '매우 높음: 상권 성격과 매우 잘 어울림'] },
  { key: 'data_confidence', name: '데이터 신뢰도', direction: 0, fields: 'districtCount, districtTotal',
    instructions: '점포 수가 적으면 비중과 입지계수가 몇 곳의 개업·폐업에도 크게 흔들립니다. 선택 업종 점포 수(districtCount)와 전체 점포 수로 볼 때 이 수치들을 얼마나 믿을 수 있는지 평가하세요.',
    levels: ['매우 낮음: 선택 업종 점포 10곳 미만', '낮음: 10~30곳 수준', '보통: 30~100곳 수준', '높음: 100~300곳 수준', '매우 높음: 300곳 이상'] }
];
CRITERIA.forEach(c => { SCORE_LEVELS[c.key] = FIVE; });
export const SCAN_LEVELS = ['매우 작음', '작음', '보통', '큼', '매우 큼'];
export const scanKey = (code) => `scan_${code.toLowerCase()}`;

const core = {
  market_pattern: {
    type: 'choice',
    instructions: '제시된 숫자와 창업 메모를 함께 읽고 이 후보 지역의 상권 특성을 하나 고르세요. 점포 수만으로 성공 가능성을 단정하지 마세요.',
    criteria: {
      crowded: '선택 업종의 점포 비중이 비교 지역보다 높거나 메모에서 경쟁이 강함을 나타냄',
      relatively_sparse: '선택 업종의 점포 비중이 비교 지역보다 낮고 현장 수요 확인이 필요한 상태',
      mixed: '수치와 메모가 엇갈리거나 차이가 작아 한 방향으로 분류하기 어려움',
      insufficient: '메모 또는 수치만으로 상권의 맥락을 파악하기 어려움'
    }
  },
  visit_priority: {
    type: 'score',
    instructions: '창업 결론이 아니라 현장 조사를 먼저 할 우선순위를 평가하세요. 메모의 구체성, 수치와의 관계, 확인할 가설이 있는지를 고려하세요.',
    criteria: ['낮음: 현장 조사 질문부터 다시 정리', '보통: 비교 후보와 함께 조사', '높음: 가설을 가지고 현장 방문', '매우 높음: 우선 방문하여 가설 검증']
  },
  needs_more_evidence: {
    type: 'noul',
    instructions: '임대료, 유동인구, 매출, 폐업률, 시간대별 수요 등 빠진 정보 때문에 창업 판단 전에 추가 조사가 필요한가?',
    criteria: { true: '중요한 현장 또는 수요 자료가 부족함', false: '판단에 필요한 여러 검증 자료가 메모에 충분히 제시됨' }
  }
};

const deep = {
  commercial_character: {
    type: 'choice',
    instructions: 'topIndustries(상위 업종 비중), specialized(시도 대비 특화 업종의 입지계수), mixDiversity(업종 다양성 0~1)를 보고 이 시군구 상권의 전체 성격을 하나 고르세요. 선택 업종 하나가 아니라 지역 전체의 업종 구성을 기준으로 판단하세요.',
    criteria: {
      residential_life: '소매, 수리·개인, 보건의료 등 주민 생활 업종의 비중이나 특화가 두드러짐',
      office_business: '과학·기술, 부동산, 시설관리·임대 등 업무·전문서비스 업종의 특화가 두드러짐',
      tourism_food: '숙박, 음식, 예술·스포츠 등 방문객·외식 업종의 특화가 두드러짐',
      education_family: '교육 업종의 비중이나 특화가 두드러짐',
      mixed_balanced: '특화 업종이 뚜렷하지 않고 업종이 고르게 섞여 있음'
    }
  },
  entry_risk_focus: {
    type: 'choice',
    instructions: '수치와 창업 메모를 함께 볼 때, 이 창업 아이디어를 현장에서 가장 먼저 검증해야 할 위험 하나를 고르세요.',
    criteria: {
      oversupply: '같은 업종 점포 비중이 높아 경쟁 과밀이 가장 큰 위험',
      demand_unclear: '점포가 적거나 신호가 엇갈려 실제 고객 수요가 있는지가 가장 불확실함',
      cost_unknown: '임대료·보증금·인건비 등 비용 정보가 없어 수익 구조를 알 수 없음',
      customer_mismatch: '메모의 목표 고객과 지역의 업종 구성이 맞지 않을 수 있음',
      info_gap: '메모가 너무 짧거나 모호해 위험을 특정하기 어려움'
    }
  },
  hypothesis_fit: {
    type: 'noul',
    instructions: '창업 메모에 적힌 가설이나 관찰(예: 경쟁이 많다, 수요가 많다, 학원이 많다)이 제시된 공공데이터 수치와 모순 없이 들어맞습니까? 메모에 검증 가능한 가설이 없으면 아니요 쪽으로 판단하세요.',
    criteria: { true: '메모의 가설이 공공데이터 수치와 부합함', false: '메모의 가설이 수치와 어긋나거나 확인할 가설이 없음' }
  },
  differentiation_needed: {
    type: 'noul',
    instructions: '이 지역에 이 업종으로 진입할 때, 기존 점포와 구별되는 뚜렷한 차별화(가격, 품질, 시간대, 고객층 등)가 반드시 필요합니까?',
    criteria: { true: '경쟁 점포가 많거나 비중이 높아 뚜렷한 차별화가 필요함', false: '점포 비중이 낮아 차별화보다 수요 확인이 먼저임' }
  }
};

const criteriaPack = Object.fromEntries(CRITERIA.map(c => [c.key, {
  type: 'score',
  instructions: `${c.instructions} 창업 메모는 고려하지 말고 공공데이터 수치만으로 판단하세요. 참고할 state 항목: ${c.fields}.`,
  criteria: c.levels
}]));

// Industry scan: the same entry-room question for every industry in the district, so answers line up as a ranking.
function scanPack(profile) {
  return Object.fromEntries(profile.industryTable.map(r => [scanKey(r.code), {
    type: 'score',
    instructions: `state.industryTable에서 ${r.name}(${r.code}) 행을 보세요. 이 시군구에 ${r.name} 업종 점포가 새로 들어갈 여지를 평가하세요. 입지계수(시도·전국 대비)가 1보다 낮을수록 여지가 크고, 높을수록 포화에 가깝습니다. 상권 전체 성격(topIndustries, specialized)과 어울리는지도 고려하세요. 창업 메모는 고려하지 마세요.`,
    criteria: ['매우 작음: 비중이 뚜렷이 높아 포화 신호', '작음: 평균보다 비중이 높음', '보통: 평균 수준', '큼: 평균보다 비중이 낮고 상권 성격과 어울림', '매우 큼: 비중이 뚜렷이 낮고 상권 성격과 잘 어울림']
  }]));
}

// Dynamic choice: the options are the learner's own candidate regions.
function firstVisit(profile) {
  const options = { c0: `${profile.region} (현재 선택)` };
  profile.candidates.forEach((c, i) => { options[`c${i + 1}`] = c.region; });
  return {
    type: 'choice',
    instructions: 'state의 현재 선택 지역과 candidates(비교 후보)의 선택 업종 비중(share), 입지계수(locationQuotient), 점포 수를 비교하고, 창업 메모의 가설을 가장 효과적으로 검증할 수 있는 곳을 먼저 방문할 곳으로 하나 고르세요.',
    criteria: Object.fromEntries(Object.entries(options).map(([k, v]) => [k, `${v}을(를) 먼저 방문`]))
  };
}

export const PACKS = {
  core: { name: '종합 판단', desc: '메모와 수치를 함께 읽는 판단' },
  criteria: { name: '다기준 평가', desc: '공공데이터만으로 7개 기준 채점' },
  scan: { name: '업종 스캔', desc: '10개 업종의 진입 여지 비교' }
};

export function buildPack(profile, pack) {
  if (pack === 'criteria') return { ...criteriaPack };
  if (pack === 'scan') return scanPack(profile);
  const q = { ...core, ...deep };
  if (profile.candidates?.length) q.first_visit = firstVisit(profile);
  return q;
}

export function buildQuestions(profile, packs = Object.keys(PACKS)) {
  return Object.assign({}, ...packs.map(p => buildPack(profile, p)));
}
export const CORE_KEYS = Object.keys(core);
export const DEEP_KEYS = Object.keys(deep);
export const CRITERIA_KEYS = CRITERIA.map(c => c.key);
