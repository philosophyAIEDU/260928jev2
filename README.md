# JEV 상권 탐색 실습실

전국 시군구의 업종별 점포 수를 살펴보고, 창업 메모와 함께 **TypeSafe JEV**에 구조화된 질문을 보내는 교육용 앱입니다. [실습 자료](docs/CLASSROOM.md)를 함께 배포합니다.

## 무엇을 배우나요?

1. 공공데이터에서 점포 수를 **정확하게 집계**합니다.
2. `선택 업종 점포 수 ÷ 전체 점포 수`로 비중을 계산하고 시도와 비교합니다.
3. JEV에 같은 자료와 창업 메모를 보내 `choice`(상권 특성), `score`(현장 조사 우선순위), `noul`(추가 근거 필요 여부)을 한 번에 받습니다.
4. AI 응답의 확률과 실제 창업 성공률을 구분합니다.

## 사이트 구성

| 단계 | 기능 | JEV에 대해 배우는 점 |
|---|---|---|
| ① JEV 이해하기 | 대화형 답변과 JEV 구조화 답변 비교, “표로 옮기기” 체험, 장점 4가지, Choice·Score·Noul 확률 슬라이더, `state + questions → answers` 흐름도 | 답의 모양을 먼저 정하고 확률로 불확실성을 읽는 방식 |
| ② 실습실 | 시군구·업종 선택, 업종 구성 막대, 시도 안 비중 순위, **심층 지표**(입지계수, 전국 비중, 규모 지수, 업종 다양성, 특화 업종), 비교 후보 2곳, 연습 사례 6종, 메모 근거 표시, 요청 미리보기, **분석 묶음 3개(종합 판단·다기준 평가·업종 스캔)를 동시에 요청**, 다기준 스코어카드와 가중치, 업종 스캔 순위, 교차 확인, 선택지별 확률 분포, 현장 조사 체크리스트 | 판단 재료(state)가 답에 어떻게 반영되는지, 한 요청에 여러 질문을 묶는 방법 |
| ②-1 Gemini 종합 상담 | JEV 결과·교차 확인·공공데이터 지표를 `gemini-3.5-flash-lite`에 보내 판단을 확인하고 쉽게 풀어 쓴 해설 생성(입문자용/분석가용), 추가 질문 대화, 보낸 입력 공개, 키 없는 예시 상담 | 판단(JEV)과 설명(Gemini)의 역할 나누기, 근거 추적 |
| ③ 비교 보드 | 분석 결과를 저장해 한 표로 비교, CSV 내보내기 (브라우저 저장소, API 키 제외) | 같은 구조의 답이라 여러 지역을 자동으로 모을 수 있음 |
| ④ 질문 설계 | 질문 키·유형·지시문·기준을 직접 만들고 형식 검사, 실습실 분석에 추가 전송 | 질문을 설계하는 사람이 답의 범위를 정함 |
| ⑤ 개념 퀴즈 | 10문항, 즉시 해설 | 비중·%p·확률의 올바른 해석 |

예시 모드는 **입지계수·순위·업종 구성과 메모에 담긴 근거 종류**로 값을 만드는 공개 규칙입니다. 메모를 바꾸면 값이 달라져 흐름을 체험할 수 있지만 JEV 응답이 아닙니다. 직접 만든 질문의 예시 값은 의미 없는 자리표시 값입니다.

## JEV 질문 구성

질문은 세 개의 **분석 묶음**으로 나뉘며, 묶음마다 `/v1/systemone` 요청 한 번에 여러 질문을 담아 브라우저가 동시에 보냅니다(`pack` 값: `core`, `criteria`, `scan`). 한 묶음이 실패해도 나머지 결과는 표시합니다. 아래는 **종합 판단(core)** 묶음입니다. 정의는 [`shared/jev-questions.mjs`](shared/jev-questions.mjs)에 있으며 서버 요청과 화면 설명이 같은 파일을 씁니다.

| 키 | 유형 | 묻는 것 |
|---|---|---|
| `market_pattern` | choice | 상권 특성 (밀집 / 적음 / 혼합 / 근거 부족) |
| `visit_priority` | score 0~3 | 현장 조사 우선순위 |
| `needs_more_evidence` | noul | 창업 판단 전 추가 조사 필요 여부 |
| `commercial_character` | choice | 업종 구성으로 본 상권 전체 성격 (주거 생활형, 업무·전문서비스형, 관광·외식형, 교육·가족형, 복합형) |
| `entry_risk_focus` | choice | 먼저 검증할 위험 (경쟁 과밀, 수요 불확실, 비용 미확인, 고객층 불일치, 정보 부족) |
| `hypothesis_fit` | noul | 메모의 가설이 공공데이터 수치와 부합하는가 |
| `differentiation_needed` | noul | 진입 시 뚜렷한 차별화가 필요한가 |
| `first_visit` | choice (동적) | 비교 후보를 고른 경우, 먼저 방문할 곳. 선택지가 학습자가 고른 지역으로 만들어집니다 |
| (직접 만든 질문) | 선택 | 질문 설계 화면에서 만든 질문 |

### 다기준 평가 (criteria)

공공데이터만으로(창업 메모 제외) 7개 기준을 모두 같은 0~4 Score로 판단합니다.

| 키 | 기준 | 방향 | 참고 지표 |
|---|---|---|---|
| `competition_pressure` | 경쟁 압력 | 낮을수록 유리 | 입지계수, 순위, 점포 수 |
| `supply_gap` | 공급 여지 | 높을수록 유리 | 입지계수, 규모 지수 |
| `demand_signal` | 연관 수요 신호 | 높을수록 유리 | 연관 업종의 입지계수 |
| `market_scale` | 상권 규모 | 높을수록 유리 | 규모 지수 |
| `mix_stability` | 업종 다양성 | 높을수록 유리 | 업종 다양성, 편중 |
| `industry_fit` | 업종-상권 궁합 | 높을수록 유리 | 상위·특화 업종 |
| `data_confidence` | 데이터 신뢰도 | 종합 점수에 넣지 않음 | 선택 업종 점포 수 |

화면은 기준별 점수를 0~1로 바꿔(경쟁 압력은 뒤집어) 가중 평균한 **현장 조사 매력도**를 보여 줍니다. 가중치(0~3)는 화면에서 바꿀 수 있고 JEV를 다시 부르지 않습니다. JEV가 준 단계별 확률로 기준마다 표준편차를 계산해 ±불확실성과 “불확실” 표시를 붙입니다. 계산은 [`shared/analysis.mjs`](shared/analysis.mjs)에 있습니다.

**연관 업종**은 선택 업종의 손님을 끌어올 수 있다고 가정한 업종입니다(예: 음식 ← 과학·기술, 숙박, 예술·스포츠). 교육용 가정이며 `RELATED` 표에서 바꿀 수 있습니다.

### 업종 스캔 (scan)

같은 “새 점포가 들어갈 여지” 질문을 10개 업종마다 던집니다(`scan_g2` 등). 모든 답이 같은 형식이라 바로 순위표가 됩니다.

### 교차 확인

기준마다 숫자 하나로 만든 **단순 규칙 점수**(예: 경쟁 압력 ≈ 2 + (입지계수 − 1) × 4 + 순위 보정)와 JEV 점수를 나란히 놓고, 1.2 이상 차이 나면 “다시 보기”로 표시합니다. JEV가 틀렸다는 뜻이 아니라 근거를 다시 볼 곳입니다. 이 표도 Gemini에게 함께 전달됩니다.

심층 지표는 [`shared/market-profile.mjs`](shared/market-profile.mjs)가 `data/market.json`에서 계산합니다. **입지계수** = 시군구 업종 비중 ÷ 시도(또는 전국) 업종 비중, **규모 지수** = 시군구 전체 점포 수 ÷ 시도 내 시군구 평균, **업종 다양성** = 10개 업종 비중의 정규화 엔트로피(0~1), **특화 업종** = 시도 대비 입지계수 1.3 이상이면서 비중 2% 이상인 업종입니다.

## Gemini 종합 상담

JEV 결과가 나오면 05단계에서 Gemini가 JEV의 기준별 판단을 근거 숫자·교차 확인 표와 대조해 **확인**하고, 선택한 수준(입문자용 쉬운 설명 / 분석가용 요약)으로 **풀어 설명**합니다. 사용자가 입력한 Gemini API 키로 `netlify/functions/gemini-consult.mjs`(`/api/gemini/consult`)를 호출합니다. 모델은 `gemini-3.5-flash-lite`이며 Google의 `generateContent` REST API를 씁니다. 서버는 받은 지표와 JEV 답을 형식 검사한 뒤 [`shared/consult-prompt.mjs`](shared/consult-prompt.mjs)로 상담 자료를 만듭니다. 시스템 지시는 없는 통계를 지어내지 말 것, JEV 점수·확률을 인용할 것, 교차 확인에서 차이 나는 항목의 가능한 이유를 설명할 것, 사실·JEV 판단·상담가 의견을 구분할 것, 창업 여부를 결론 내리지 말 것을 요구합니다. 추가 질문은 이전 대화를 함께 보내며 최대 5회까지 이어집니다. 화면의 **Gemini에게 보낸 입력 보기**에서 실제 입력을 확인할 수 있습니다. 키 없이 보는 예시 상담은 숫자를 정해진 문장 틀에 넣은 것이며 Gemini 출력이 아닙니다. Gemini 키도 JEV 키와 마찬가지로 저장하지 않습니다.

시군구 업종 비중은 인구당 점포 밀도나 매출을 의미하지 않습니다. 시도 평균에는 선택한 시군구도 포함됩니다. “점포가 적다”는 사실만으로 창업 기회라 판단할 수 없습니다.

## 출처와 재현

- 원천: 소상공인시장진흥공단 **상가(상권)정보 2026년 6월** 파일.
- 재가공 출처: [260903academy의 `data/processed/commercial-stats.json`](https://github.com/philosophyAIEDU/260903academy/blob/claude/gg-academy-map-search-j0hzqc/data/processed/commercial-stats.json). 해당 저장소의 집계 스크립트가 원본 CSV를 행정동 × 업종 소분류 단위로 묶었습니다.
- 이 프로젝트의 [`scripts/build-data.py`](scripts/build-data.py)는 다시 시군구 × 업종 대분류로 합쳐 [`data/market.json`](data/market.json)을 생성합니다. **256개 시군구, 10개 업종 대분류, 2,772,484개 점포**의 집계 합계를 보존합니다. 16개 시도 범위입니다.
- 지역명은 원본 집계에 저장된 명칭을 그대로 사용합니다. 행정구역/상호 상태는 2026년 6월 이후 달라질 수 있습니다.

재생성: `python scripts/build-data.py /경로/commercial-stats.json`. 검증용 `assert`가 합계 일치를 확인합니다. 원본 CSV와 개별 상호 목록을 이 저장소에 중복 보관하지 않습니다.

## 실행

정적 화면과 예시 모드에는 설치가 필요하지 않습니다.

```bash
python -m http.server 8000
```

`http://localhost:8000`에서 **키 없이 예시 보기**를 눌러 흐름을 확인하세요. 실제 JEV 호출은 Netlify Functions가 필요합니다. [Netlify CLI](https://docs.netlify.com/cli/get-started/)가 설치된 환경에서 이 폴더를 열고 `netlify dev`를 실행하면 `/api/jev/analyze`와 `/api/gemini/consult` 함수가 연결됩니다. Netlify에 저장소를 연결할 때 빌드 명령 없이 게시 디렉터리 `.`로 배포합니다. `netlify.toml`에 설정이 들어 있습니다.

API 키는 사용자가 브라우저에 입력하며, 브라우저 저장소와 서버 환경 변수에 기록하지 않습니다. 요청 때마다 서버 함수를 거쳐 TypeSafe API에 보내므로 본인이 신뢰하는 사이트에서만 입력하세요. 호출 비용과 한도는 본인의 TypeSafe 계정에 따릅니다. 실제 API 응답은 키 없이 테스트할 수 없으므로 배포 뒤 발급된 키로 검증해야 합니다.

## 파일 안내

| 파일 | 역할 |
|---|---|
| `data/market.json` | 전국 시군구 × 업종 대분류 집계 |
| `app.js` | 선택, 통계·순위·심층 지표 표시, 예시 및 실제 결과 표시, 비교 보드 |
| `consult.js` | Gemini 상담 화면, 안전한 마크다운 표시, 추가 질문 대화 |
| `shared/market-profile.mjs` | 심층 지표 계산과 서버 측 형식 검사 |
| `shared/jev-questions.mjs` | JEV 질문 정의 (서버·화면 공용) |
| `shared/analysis.mjs` | 다기준 종합 점수·불확실성, 업종 스캔 순위, 교차 확인 (서버·화면 공용) |
| `shared/consult-prompt.mjs` | Gemini 상담 입력 생성 (서버·화면 공용) |
| `netlify/functions/gemini-consult.mjs` | Gemini 호출과 오류 처리 |
| `learn.js` | 답변 비교 체험, 질문 유형 슬라이더, 개념 퀴즈 |
| `builder.js` | 질문 설계 화면 |
| `shared/question-schema.mjs` | 직접 만든 질문의 형식 검사 (브라우저와 서버 함수가 함께 사용) |
| `netlify/functions/jev-analyze.mjs` | 실제 JEV 요청과 질문 정의, 선택적 추가 질문 검사, 응답 오류 처리 |
| `docs/CLASSROOM.md` | 강사용 진행안, 실습 활동, 정답 예시 |
| `docs/scenarios.csv` | 창업 메모 연습 사례 |
| `assets/market-hero.webp` | 공공데이터와 현장 확인을 연결하는 생성형 삽화 |
| `assets/jev-three-decisions.webp` | Noul, Choice, Score를 그림으로 비유한 생성형 삽화 |
| `illustrations.css` | 삽화의 반응형 화면 배치 |

삽화는 개념 설명을 위해 생성했으며 실제 지역 사진이나 분석 결과가 아닙니다. 정확한 용어는 이미지 아래의 HTML 설명으로 표시합니다.

JEV 요청은 [1번 저장소의 서버 함수](https://github.com/philosophyAIEDU/260921jev/blob/claude/eager-knuth-8afjke/netlify/functions/jev-analyze.ts)와 같은 `/v1/systemone` 엔드포인트, `jev-latest`, `state` + `questions` 구조를 사용합니다. 예시 모드는 단순 규칙과 **임의의 확률**을 사용하므로 JEV 응답으로 취급하면 안 됩니다.

## 확인하기

`for f in *.js shared/*.mjs netlify/functions/*.mjs; do node --check $f; done`로 문법을 검사하고, `python scripts/build-data.py …`로 데이터 합계를 검사할 수 있습니다. 비밀 키를 저장소에 커밋하지 마세요.
