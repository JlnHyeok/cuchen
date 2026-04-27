# Governance Execution Plan

## 기준
- 이 메모는 `docs/agent/roadmap.md`를 실행 관점으로 쪼갠다.
- 우선순위는 계약 고정, E2E 검증, 문서 정합성, 리뷰 게이트다.
- 모든 스텝은 로그와 인수인계 없이는 종료하지 않는다.

## 1. 에이전트별 단계

### Architecture agent
1. `docs/architecture/spec.md`와 `docs/backend/spec.md`, `docs/frontend/spec.md`, `docs/integration/spec.md`의 경계가 같은지 먼저 맞춘다.
2. `imageId`, bucket, object key, metadata field, `result` vs `aiResult` 명명 규칙을 하나로 고정한다.
3. MongoDB와 MinIO의 정본 역할을 문서에서 먼저 확정한다.
4. backend/frontend/integration 문서가 같은 네트워크 맵을 쓰는지 확인한다.

### Integration / QA agent
1. backend, SvelteKit frontend, MongoDB, MinIO를 관통하는 ingest/list/filter/detail/download 경로를 분해해서 검증한다.
2. partial write, stale cache, bucket deletion, retry 시나리오를 재현한다.
3. SvelteKit frontend가 backend HTTP API 경로를 벗어나지 않는지 확인한다.
4. 실패 케이스마다 재현 절차와 관측 로그를 남긴다.

### Docs keeper
1. 구현 변경이 있으면 spec, plan, review, incident를 같이 맞춘다.
2. 오래된 예시, 오래된 명명, 오래된 경계 설명을 제거한다.
3. `docs/agent/` 아래 문서와 `docs/governance/` 아래 문서의 역할 충돌을 정리한다.
4. 문서-코드 불일치 수, stale section 수, missing review point 수를 줄이는 방향으로 정리한다.

### Review owner
1. 머지 전 마지막 게이트에서 데이터 흐름과 실패 경로를 본다.
2. backend/MinIO/frontend 책임이 섞인 변경을 찾는다.
3. MongoDB와 MinIO의 정본 분리가 깨지지 않았는지 본다.
4. 리뷰 산출물 4종, 즉 문제/영향 범위/근거/수정 제안을 강제한다.

## 2. 게이트 조건
- Architecture gate: 계약, 명명, 경계가 문서에 먼저 고정돼 있어야 한다.
- Integration gate: ingest/list/filter/detail/download의 E2E가 재현 가능해야 한다.
- Docs gate: spec과 review가 구현보다 뒤처져 있으면 통과하지 않는다.
- Review gate: partial write, stale state, contract drift, 병목 위치가 설명되지 않으면 통과하지 않는다.
- Merge gate: 스텝 로그와 인수인계가 없는 변경은 종료로 보지 않는다.

## 3. 로그 / 인수인계 요구사항
- 스텝 시작 시 작업 로그를 만든다.
- 스텝 종료 시 `Changes`, `Validation`, `Risks / Open Items`, `Next Owner`를 채운다.
- 인수인계에는 무엇을 했는지, 무엇이 남았는지, 어떤 파일을 건드렸는지, 어떤 검증을 했는지, 다음 에이전트가 조심할 점, 작업 로그 경로를 넣는다.
- 실패를 성공으로 적지 않는다.
- 긴 작업은 중간 의사결정도 로그에 남긴다.

## 4. 총책임자 확인 포인트
- 문서 간 용어가 같은 뜻인지 본다.
- backend/MinIO/frontend 경계가 흐려지지 않았는지 본다.
- MongoDB와 MinIO 역할이 중복되지 않는지 본다.
- partial write가 완료 데이터처럼 보이지 않는지 본다.
- 각 스텝에 로그와 인수인계가 남았는지 본다.
- stale section, missing review point, 문서-코드 불일치가 늘지 않았는지 본다.

## 운영 메모
- Architecture agent는 contract drift를 막는 선행 게이트다.
- Integration / QA agent는 실제 실패를 재현하는 후행 게이트다.
- Docs keeper는 변경이 문서에 남도록 하는 정합성 게이트다.
- Review owner는 머지 직전의 최종 판정 게이트다.
