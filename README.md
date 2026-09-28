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
| ② 실습실 | 시군구·업종 선택, 업종 구성 막대, 시도 안 비중 순위, 연습 사례 6종, 메모 근거 표시, 요청 미리보기, 선택지별 확률 분포, 현장 조사 체크리스트 | 판단 재료(state)가 답에 어떻게 반영되는지 |
| ③ 비교 보드 | 분석 결과를 저장해 한 표로 비교, CSV 내보내기 (브라우저 저장소, API 키 제외) | 같은 구조의 답이라 여러 지역을 자동으로 모을 수 있음 |
| ④ 질문 설계 | 질문 키·유형·지시문·기준을 직접 만들고 형식 검사, 실습실 분석에 추가 전송 | 질문을 설계하는 사람이 답의 범위를 정함 |
| ⑤ 개념 퀴즈 | 7문항, 즉시 해설 | 비중·%p·확률의 올바른 해석 |

예시 모드는 **비중 비율과 메모에 담긴 근거 종류**로 값을 만드는 공개 규칙입니다. 메모를 바꾸면 값이 달라져 흐름을 체험할 수 있지만 JEV 응답이 아닙니다. 직접 만든 질문의 예시 값은 의미 없는 자리표시 값입니다.

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

`http://localhost:8000`에서 **키 없이 예시 보기**를 눌러 흐름을 확인하세요. 실제 JEV 호출은 Netlify Functions가 필요합니다. [Netlify CLI](https://docs.netlify.com/cli/get-started/)가 설치된 환경에서 이 폴더를 열고 `netlify dev`를 실행하면 `/api/jev/analyze` 함수가 연결됩니다. Netlify에 저장소를 연결할 때 빌드 명령 없이 게시 디렉터리 `.`로 배포합니다. `netlify.toml`에 설정이 들어 있습니다.

API 키는 사용자가 브라우저에 입력하며, 브라우저 저장소와 서버 환경 변수에 기록하지 않습니다. 요청 때마다 서버 함수를 거쳐 TypeSafe API에 보내므로 본인이 신뢰하는 사이트에서만 입력하세요. 호출 비용과 한도는 본인의 TypeSafe 계정에 따릅니다. 실제 API 응답은 키 없이 테스트할 수 없으므로 배포 뒤 발급된 키로 검증해야 합니다.

## 파일 안내

| 파일 | 역할 |
|---|---|
| `data/market.json` | 전국 시군구 × 업종 대분류 집계 |
| `app.js` | 선택, 통계·순위 계산, 예시 및 실제 결과 표시, 비교 보드 |
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

`for f in app.js learn.js builder.js shared/question-schema.mjs netlify/functions/jev-analyze.mjs; do node --check $f; done`로 문법을 검사하고, `python scripts/build-data.py …`로 데이터 합계를 검사할 수 있습니다. 비밀 키를 저장소에 커밋하지 마세요.
