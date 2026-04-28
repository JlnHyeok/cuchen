# AGENTS.md

이 파일은 이 저장소에서 Codex가 가장 먼저 읽는 실행 지침이다.

## 기본 행동 원칙
- 코드 타이핑 전에 가정, 목표, 수정 범위를 먼저 정리한다.
- 불확실하거나 문서끼리 충돌하면 추측으로 진행하지 말고 확인한다.
- 요청받은 범위만 수정한다. 요청되지 않은 기능, 추상화, 에러 처리는 추가하지 않는다.
- 목표를 구체적인 종료 조건으로 바꿔 실행한다. 예: "기능 추가"가 아니라 "관련 테스트 통과".
- 기존 사용자 변경이나 다른 에이전트의 변경을 되돌리지 않는다.
- 오래된 문서를 남긴 채 새 문서만 추가하지 않는다.

## 문서 역할
- `AGENTS.md`: Codex가 즉시 따라야 하는 현재 실행 지침
- `docs/agent/`: 세부 에이전트 운영 규칙, 읽기 맵, 인수인계, 템플릿
- `docs/*/spec.md`: 구현 계약
- `docs/*/plan.md`: 진행 계획
- `docs/*/review.md`: 리뷰 기준

## 작업 전 읽기 순서
1. `AGENTS.md`
2. `docs/README.md`
3. `docs/overview.md`
4. `docs/architecture/spec.md`
5. `docs/agent/playbook.md`
6. 작업 영역에 맞는 역할별 문서

역할별 문서는 `docs/agent/playbook.md`의 읽기 맵을 따른다. 한 작업 시작 전에 읽는 문서는 가능한 한 5개 안팎으로 제한하고, 막히는 지점이 생길 때만 추가 문서를 읽는다.

## 하위 에이전트 활용
- 사용자가 하위 에이전트 사용을 요청했거나 작업 규모가 커서 병렬 점검이 유효할 때 활용한다.
- 기본 하위 에이전트는 `gpt-5.4-mini` `xhigh`로 사용한다.
- 하위 에이전트에는 구체적이고 독립적인 질문이나 수정 범위를 준다.
- 컨텍스트가 64k 이상으로 커질 작업은 문서 영역, 코드 영역, 검증 영역처럼 더 작게 나눠 지시한다.
- 하위 에이전트 결과는 그대로 믿고 끝내지 않고, 현재 작업 목표와 충돌하는지 최종 확인한다.

## 현재 활성 구조
- `apps/backend/`: NestJS 백엔드
- `apps/frontend/`: SvelteKit 최종 사용자 UI
- `apps/desktop/`: Electron 데스크톱 앱
- `infra/docker/`: MongoDB, MinIO, backend 실행 인프라
- `docs/`: 명세, 계획, 리뷰, 에이전트 운영 문서

## 구현 경계
- MongoDB는 목록, 필터, 메타데이터 조회의 정본이다.
- MinIO는 이미지 원본, 썸네일, 다운로드 객체의 정본이다.
- SvelteKit 프론트엔드는 MongoDB나 MinIO에 직접 접근하지 않는다.
- 프론트엔드는 backend HTTP API를 통해서만 목록, 이미지, 다운로드를 처리한다.
- 백엔드 내부 공용 타입과 유틸은 `apps/backend/src/shared.ts`를 우선한다.

## 검증 기준
- backend 변경: `cd apps/backend && npm run test`
- frontend 변경: `cd apps/frontend && npm test && npm run check && npm run build`
- desktop 변경: `cd apps/desktop && npm run test`
- docker 변경: `cd infra/docker && docker compose --env-file .env config`
- 문서만 변경한 경우에는 실행 검증 대신 변경 이유와 동기화 범위를 남긴다.
