# 프로젝트 로드맵

## 목표
이 프로젝트는 MongoDB + MinIO 투트랙 구조를 기준으로 backend와 SvelteKit frontend를 분리 배포한다.

## 총괄 원칙
- 조회 가능한 메타데이터의 정본은 MongoDB다.
- 이미지 바이너리의 정본은 MinIO다.
- 최종 UI 진입점은 `apps/frontend`의 SvelteKit 앱으로 유지하되 backend와는 분리 배포한다.
- 계약의 기준은 `docs/` 아래 문서 세트다.
- 모든 단계는 스텝별 변경 로그와 대화 요약을 남기며 진행한다.

## 실행 단계

### 0단계. 계약 고정
담당: Architecture agent

작업:
- MongoDB와 MinIO의 저장 분리를 고정한다.
- 유지해야 할 HTTP 표면을 고정한다.
- `imageId`, 버킷명, object key, metadata 필드 규칙을 고정한다.
- `result`, `aiResult`, `processCode`, tag 명명 차이를 구현 전에 정리한다.

종료 기준:
- backend, frontend, integration 문서가 같은 경계를 공유한다.
- 어떤 에이전트도 충돌하는 데이터 형태를 임의로 구현하지 않는다.

### 1단계. 백엔드 기반
담당: Backend agent

작업:
- ingest, metadata, image retrieval, health를 위한 NestJS 모듈을 만든다.
- 조회 가능한 메타데이터를 위한 MongoDB schema와 repository를 추가한다.
- 바이너리 저장과 원본 JSON 보존은 MinIO에 유지한다.
- 필요하면 기존 HTTP route 호환성을 유지한다.

종료 기준:
- 하나의 ingest 경로가 MongoDB와 MinIO에 동시에 기록한다.
- search/list API는 manifest 메모리가 아니라 MongoDB를 읽는다.
- image/download 경로는 계속 MinIO를 사용한다.

### 2단계. 프론트엔드 이관
담당: Frontend agent

작업:
- 목록/페이지네이션/필터 질의를 백엔드 기반으로 옮긴다.
- 이미지 보기와 다운로드는 MinIO 경로를 유지한다.
- 프론트엔드의 전체 데이터셋 필터링을 제거한다.
- 백엔드 이관 중에도 뷰어를 안정적으로 유지한다.

종료 기준:
- 프론트엔드가 전체 데이터를 올려서 필터링하지 않는다.
- 페이지네이션과 필터는 백엔드 조회로 처리한다.
- 이미지 미리보기와 다운로드는 MinIO에서 정상 동작한다.

### 3단계. E2E 검증
담당: Integration / QA agent

작업:
- backend, SvelteKit frontend, MongoDB, MinIO를 관통하는 ingest, list, filter, detail, download를 검증한다.
- partial write 상황을 재현하고 화면에 보이는지 확인한다.
- 삭제되었거나 오래된 버킷이 UI에 남지 않는지 확인한다.

종료 기준:
- 파일 투입부터 UI 표시까지 전체 경로를 재현할 수 있다.
- 실패 케이스가 명시적인 동작과 로그를 가진다.

### 4단계. 성능 검증
담당: Performance agent

작업:
- 1,000 / 10,000 / 25,000건에서 ingest 처리량을 측정한다.
- list, filter, detail, image-view, download 지연을 각각 측정한다.
- MongoDB 조회 지연과 MinIO 이미지 전달 지연을 비교한다.

종료 기준:
- 주요 흐름의 p50/p95가 기록된다.
- 회귀가 발생해도 어느 계층 때문인지 추적 가능하다.

### 5단계. 문서화와 리뷰
담당: Docs keeper + Review owner

작업:
- spec, plan, review, incident 문서를 구현과 맞춘다.
- backend, frontend, integration 문서 간 간극을 줄인다.
- 사고와 반복 이슈를 기록한다.

종료 기준:
- 오래된 동작이 문서에 남지 않는다.
- 리뷰 기준이 실제 네트워크와 데이터 흐름과 일치한다.

### 6단계. 배포 전략
담당: Deployment / Packaging agent

작업:
- backend와 frontend의 분리 배포 산출물을 정한다.
- backend는 Docker 스택으로, frontend는 SvelteKit 배포 산출물로 나눈다.
- backend URL 주입, 환경설정, 업데이트 흐름을 정한다.
- 운영자용 backend 산출물과 사용자용 frontend 산출물을 분리한다.

종료 기준:
- 배포 권고안이 backend / frontend 분리 형태로 하나로 수렴한다.
- Docker 스택과 SvelteKit 배포 산출물이 서로 충돌하지 않는다.
- 설치기 없이도 각 산출물이 독립적으로 배포 가능하다.

## 에이전트 책임

### Architecture agent
- 계약, 명명, 경계, 횡단 결정의 책임자다.
- 구현 시작 전에 문서 드리프트를 점검한다.

### Backend agent
- NestJS 모듈, MongoDB 저장, MinIO 기록, API 응답을 책임진다.
- UI 관련 책임을 가져오지 않는다.

### Frontend agent
- SvelteKit 화면, 페이지네이션, 필터링, 다운로드 UX를 책임진다.
- 저장 규칙을 책임지지 않는다.

### Integration / QA agent
- end-to-end 흐름, 실패 재현, 시스템 간 검증을 책임진다.
- split-brain이나 partial write를 즉시 보고한다.

### Performance agent
- 벤치마크, 회귀 탐지, 타이밍 로그를 책임진다.
- 비교 시 데이터 규모와 환경을 일정하게 유지한다.

### Docs keeper
- spec 정합성과 오래된 문서 제거를 책임진다.
- 계약이 바뀌면 구현보다 먼저 문서를 고친다.

### Review owner
- 머지 시점의 일관성 리뷰를 책임진다.
- backend, frontend, integration 문서에서 같은 용어가 같은 뜻인지 확인한다.

### Deployment / Packaging agent
- 패키징 전략, 배포 형태, 런타임 구성을 책임진다.
- 선택한 배포 형태가 아키텍처 계약과 맞아야 한다.

### 보관: Installer / Bootstrap agent
- 보관용 역할이다.
- 현재 활성 로드맵에는 포함하지 않는다.

## 일관성 점검
총괄 관점에서 다음이 흔들리면 작업을 반려한다.
- `result` vs `aiResult` 명명 규칙이 정규화 규칙 없이 섞이는 경우
- MongoDB와 manifest가 동시에 search 정본 역할을 하는 경우
- MongoDB 페이지네이션이 있는데도 frontend가 전체 데이터셋 클라이언트 필터링을 계속하는 경우
- MinIO console endpoint를 S3 API endpoint 대신 쓰는 경우
- partial write를 성공 레코드로 취급하는 경우

## 핸드오프 규칙
모든 인수인계에는 다음이 있어야 한다.
- 무엇이 바뀌었는지
- 무엇이 아직 막혀 있는지
- 다음 행동을 어느 계층이 맡는지
- 데이터 계약이 바뀌었는지
- 해당 스텝 작업 로그 경로
