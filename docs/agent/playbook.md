# 에이전트 플레이북

이 문서는 하위 에이전트가 실제 작업 전에 읽어야 하는 최소 운영 규칙이다.

## 1. 역할별 읽기 맵

### 공통 원칙
- 모든 에이전트는 처음에 모든 문서를 읽지 않는다.
- 먼저 `공통 필수 문서 3개`만 읽는다.
- 그다음 자기 역할의 `역할별 필수 문서`만 읽는다.
- 작업 중 막히는 지점이 생길 때만 관련 문서를 추가로 읽는다.
- 한 스텝 시작 전에 읽는 문서는 가능하면 5개를 넘기지 않는다.

### 공통 필수 문서
1. `AGENTS.md`
2. `docs/overview.md`
3. `docs/architecture/spec.md`
4. `docs/agent/playbook.md`

### 역할별 필수 문서

`Architecture agent`
- `docs/agent/roadmap.md`
- `docs/backend/spec.md`
- `docs/frontend/spec.md`
- `docs/integration/spec.md`

`Backend agent`
- `docs/backend/spec.md`
- `docs/backend/plan.md`
- `docs/agent/roadmap.md`
- `docs/agent/templates.md`

`Frontend agent`
- `docs/frontend/spec.md`
- `docs/frontend/plan.md`
- `docs/agent/roadmap.md`
- `docs/agent/templates.md`

`Integration / QA agent`
- `docs/integration/spec.md`
- `docs/governance/review.md`
- `docs/agent/roadmap.md`
- `docs/agent/templates.md`

`Performance agent`
- `docs/performance/spec.md`
- `docs/governance/review.md`
- `docs/agent/roadmap.md`
- `docs/agent/templates.md`

`Docs keeper`
- `docs/governance/docs-keeper.md`
- `docs/agent/roadmap.md`
- `docs/agent/templates.md`

`Review owner`
- `docs/governance/review.md`
- `docs/agent/roadmap.md`
- `docs/agent/templates.md`

`Deployment / Packaging agent`
- `docs/deployment/spec.md`
- `docs/deployment/plan.md`
- `docs/deployment/review.md`
- `docs/agent/roadmap.md`
- `docs/agent/templates.md`

### 추가 문서 읽기 기준
- API 계약을 바꾸면 `docs/backend/review.md`도 읽는다.
- UI 계약을 바꾸면 `docs/frontend/review.md`도 읽는다.
- 배포 형태를 바꾸면 `docs/deployment/review.md`도 읽는다.
- 반복 사고가 있었던 영역이면 `templates`의 incident 템플릿을 보고 기록을 확인한다.

## 2. 행동지침

### 기본 원칙
- 각 에이전트는 한 번에 하나의 책임만 가진다.
- 에이전트는 코드, 문서, 리뷰, 배포, 패키징 중 하나에 집중한다.
- 구현 에이전트는 다른 에이전트의 작업을 되돌리지 않는다.
- 불확실한 부분은 추정으로 밀어붙이지 말고 문서에 기록한다.
- 용어는 기존 계약 문서의 표현을 그대로 따른다.

### 작업 순서
1. 자기 역할의 필수 문서만 읽는다.
2. 구현 범위를 한 줄로 적는다.
3. 필요한 파일만 수정한다.
4. 테스트나 수동 검증을 수행한다.
5. 해당 스텝의 변경사항과 대화 요약을 작업 로그에 기록한다.
6. 결과와 남은 리스크를 기록한다.

### 금지 사항
- 문서에 없는 구조를 임의로 추가하지 않는다.
- 이미 다른 에이전트가 수정한 파일을 되돌리지 않는다.
- 범위를 벗어난 리팩터링을 같이 하지 않는다.
- 실패한 검증을 통과한 것으로 적지 않는다.
- 오래된 문서를 남긴 채 새 문서만 추가하지 않는다.
- 로그 없이 다음 스텝으로 넘어가지 않는다.
- 원클릭 설치 관련 문서는 보관용이며 활성 배포 계약에 섞지 않는다.

### 총괄 리뷰 기준
- 데이터 흐름이 명세와 일치하는지 본다.
- MongoDB와 MinIO의 역할이 섞이지 않았는지 본다.
- 목록 조회, 필터링, 다운로드, 이미지 보기 경로를 각각 확인한다.
- 대량 데이터에서 느려질 가능성이 있는 지점을 먼저 본다.
- 배포 형태가 현재 아키텍처와 충돌하지 않는지 본다.
- 분리 배포가 backend / frontend 경계를 흐리지 않는지 본다.
- 문서 이름과 실제 역할이 맞는지 본다.
- 스텝별 로그에 변경사항과 대화 요약이 모두 남아 있는지 본다.

## 3. 인수인계 규칙

### 인수인계 형식
인수인계는 짧게 아래 6개를 포함한다.
- 무엇을 했는지
- 무엇이 남았는지
- 어떤 파일을 건드렸는지
- 어떤 검증을 했는지
- 다음 에이전트가 조심할 점
- 현재 스텝의 작업 로그 경로

### 인수인계 규칙
- 구현 에이전트는 완료 전에 핵심 리스크를 남긴다.
- 리뷰 에이전트는 수정 요구사항만 말하지 말고 왜 필요한지 적는다.
- 통합 에이전트는 연결 지점 중심으로 전달한다.
- 성능 에이전트는 데이터셋과 환경을 함께 전달한다.
- 대화 맥락이 길어졌다면 작업 로그에 의사결정 요약을 남기고 넘긴다.

### 인수인계 금지
- 추측성 상태 전달
- 파일 경로 누락
- 실패를 성공으로 포장
- 다음 에이전트가 같은 문제를 다시 조사하게 만드는 전달
- 작업 로그 경로 누락
