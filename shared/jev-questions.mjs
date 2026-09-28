// JEV question set used by the server request and by the browser to label answers.
// Keeping them in one place means the UI always explains exactly what JEV was asked.
export const CHOICE_LABELS = {
  market_pattern: { crowded: '상대적으로 밀집', relatively_sparse: '상대적으로 적음', mixed: '혼합 신호', insufficient: '근거 부족' },
  commercial_character: { residential_life: '주거 생활형', office_business: '업무·전문서비스형', tourism_food: '관광·외식형', education_family: '교육·가족형', mixed_balanced: '고르게 섞인 복합형' },
  entry_risk_focus: { oversupply: '경쟁 과밀', demand_unclear: '수요 불확실', cost_unknown: '비용 미확인', customer_mismatch: '고객층 불일치', info_gap: '정보 부족' }
};
export const SCORE_LEVELS = {
  visit_priority: ['낮음', '보통', '높음', '매우 높음'],
  competition_intensity: ['매우 낮음', '낮음', '보통', '높음', '매우 높음']
};

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
  competition_intensity: {
    type: 'score',
    instructions: '선택 업종의 경쟁 강도를 점포 수 자료로만 평가하세요. locationQuotient(시도 대비 입지계수, 1보다 크면 시도보다 비중이 높음), nationalLocationQuotient(전국 대비), rankInProvince/districtsInProvince(시도 안 순위), districtCount(절대 점포 수)를 함께 고려하세요. 매출이나 수요는 알 수 없다는 점을 전제로 하세요.',
    criteria: ['매우 낮음: 비중과 점포 수가 모두 시도·전국보다 뚜렷이 낮음', '낮음: 대체로 평균보다 낮음', '보통: 평균과 비슷하거나 신호가 엇갈림', '높음: 대체로 평균보다 높음', '매우 높음: 입지계수와 순위, 점포 수 모두 뚜렷이 높음']
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

export function buildQuestions(profile) {
  const q = { ...core, ...deep };
  if (profile.candidates?.length) q.first_visit = firstVisit(profile);
  return q;
}
export const CORE_KEYS = Object.keys(core);
export const DEEP_KEYS = Object.keys(deep);
