# Project Docs Index

이 문서는 이 저장소의 문서 진입점이다.

## 폴더명 원칙
- 이 폴더는 프로젝트 문서 저장소이므로 이름은 `docs`를 유지한다.
- `skills`는 Codex 전용 스킬 규격과 혼동될 수 있으므로 이 프로젝트 문서 폴더명으로 쓰지 않는다.
- Codex가 즉시 따라야 하는 실행 지침은 루트 `AGENTS.md`에 둔다.
- 하위 에이전트의 세부 운영 규칙, 읽기 맵, 인수인계 규칙은 `docs/agent/` 아래에 둔다.
- 이 폴더의 기본 역할은 실행 규칙이 아니라 프로젝트 명세, 계획, 리뷰 문서화다.

## 워크스페이스 기준
- 실제 구현은 `apps/backend/`, `apps/frontend/`, `packages/shared/`, `infra/docker/`를 기준으로 진행한다.
- 기존 JS/MinIO 프로토타입은 `legacy/minio-prototype/`에 보관한다.
- `apps/desktop/`은 Electron 데스크톱 앱으로 유지하지만 최종 프론트엔드 방향은 `apps/frontend/`의 SvelteKit이다.

## 구성
- `docs/overview.md`: 프로젝트 전체 기획 및 아키텍처
- `docs/master-plan.md`: 총괄 계획 문서
- `docs/architecture/spec.md`: 계약과 경계 정의
- `docs/architecture/folder-sync-pipeline.md`: 폴더 감시 자동 동기화 파이프라인
- `docs/backend/spec.md`: 백엔드 명세
- `docs/backend/plan.md`: 백엔드 개발 계획
- `docs/backend/review.md`: 백엔드 리뷰 관점
- `docs/backend/README.md`: 백엔드 문서 허브
- `docs/backend/api-spec.md`: 백엔드 API 설계서
- `docs/frontend/spec.md`: 프론트엔드 명세
- `docs/frontend/plan.md`: 프론트엔드 개발 계획
- `docs/frontend/review.md`: 프론트엔드 리뷰 관점
- `docs/integration/spec.md`: 통합 및 E2E 기준
- `docs/performance/spec.md`: 성능 측정 기준
- `docs/deployment/spec.md`: 배포 형태와 패키징 기준
- `docs/deployment/plan.md`: 배포 진행 계획
- `docs/deployment/review.md`: 배포 리뷰 관점
- `docs/deployment/README.md`: 배포 문서 허브
- `docs/reference/minio-api-reference.md`: MinIO S3 API 참고 문서
- `docs/governance/docs-keeper.md`: 문서 동기화 규칙
- `docs/governance/review.md`: 공통 리뷰 기준과 관측 포인트
- `docs/agent/README.md`: 에이전트 운영 문서 인덱스
- `docs/agent/playbook.md`: 읽기 맵, 행동지침, 인수인계 규칙
- `docs/agent/execution-plan.md`: 에이전트별 실행 계획
- `docs/agent/roadmap.md`: 총괄 진행 계획
- `docs/agent/templates.md`: 작업 로그, incident, 리뷰 체크리스트 템플릿

## 보관 문서
- `docs/deployment/installer.md`: 원클릭 설치 보관 문서
- `docs/deployment/installer-plan.md`: 원클릭 설치 보관 계획
- `docs/deployment/installer-review.md`: 원클릭 설치 보관 리뷰

## 운영 원칙
- 에이전트는 루트 `AGENTS.md`를 먼저 읽고, 세부 규칙이 필요할 때 `docs/agent/playbook.md`를 따른다.
- 문서는 코드보다 먼저 갱신한다.
- 기능 추가는 `spec -> plan -> implementation -> review` 순서로 진행한다.
- 하위 에이전트는 문서에 없는 구현을 임의로 만들지 않는다.
- 계약 문서는 구현 문서보다 우선한다.
- 오래된 구현 설명 문서는 남기지 않는다.
- 에이전트 운영 규칙은 루트 `AGENTS.md`와 `docs/agent/` 사이에서만 관리한다.
