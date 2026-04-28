# 프로젝트 총괄 계획

이 문서는 현재 대화와 하위 에이전트 검토 결과를 바탕으로, 이 프로젝트를 새 워크스페이스 구조에서 다시 개발하기 위한 총괄 계획을 정리한 문서다.

## 1. 목표
- `MongoDB + MinIO` 투트랙 구조를 기준으로 새 시스템을 구축한다.
- `NestJS backend`와 `SvelteKit frontend`를 분리 배포 기준으로 개발한다.
- 이미지 원본은 MinIO, 목록/검색/메타데이터 정본은 MongoDB로 분리한다.
- Docker 기반 backend 배포와 SvelteKit 기반 frontend 배포를 분리해서 운영 가능한 형태를 만든다.

## 2. 구현 기준 구조

```text
apps/
  backend/      NestJS 백엔드
    generated/  백엔드 감시 폴더와 임시 입력 데이터
  frontend/     SvelteKit 프론트엔드
  desktop/      Electron 데스크톱 앱
infra/
  docker/       Docker Compose, 배포 파일
docs/           명세, 계획, 리뷰, 운영 규칙
artifacts/      로그, 보고서, 벤치마크 결과
```

각 프로젝트는 자기 폴더의 `package.json`, lock, `node_modules`를 따로 관리한다.

## 3. 핵심 아키텍처 경계

### MongoDB
- 목록 조회
- 필터 검색
- 메타데이터 조회
- 페이지네이션
- 상태 문서와 ingest 결과 추적

### MinIO
- 이미지 원본 저장
- 이미지 보기
- 이미지 다운로드
- 필요 시 원본 JSON 또는 export 파일 보관

### Backend
- 폴더 감시 또는 수동 스캔
- JSON 정규화
- MongoDB upsert
- MinIO put/get
- 목록/검색/상세 API
- 실패, 재시도, partial write 처리

### Frontend
- 목록 화면
- 필터, 페이지네이션
- 이미지 단건 보기
- 체크 기반 다중 다운로드
- 최종 사용자 UI

## 4. 선행 결정사항
- MongoDB를 메타데이터의 단일 정본으로 확정한다.
- MinIO는 이미지 원본의 단일 정본으로 확정한다.
- `result`, `aiResult`, `processCode`, `metadata` 필드 규칙을 구현 전에 고정한다.
- backend와 frontend는 문서화된 HTTP API 계약을 기준으로 연동한다.
- 배포 기본형은 `backend = Docker`, `frontend = SvelteKit` 분리 배포로 둔다.
- 폴더 감시 기반 자동 동기화 파이프라인을 backend의 기본 ingest 흐름으로 확정한다.

## 4.1 자동 동기화 파이프라인
- backend는 지정된 입력 폴더를 계속 감시한다.
- 폴더에는 `.png` 또는 `.jpg`와 `.json`이 같은 basename으로 계속 유입된다.
- 이미지와 JSON이 모두 도착하고 파일 복사가 완료되면 하나의 pair로 처리한다.
- JSON에서 metadata를 정규화하고 MongoDB에 upsert한다.
- 이미지 원본은 MinIO에 저장한다.
- MongoDB 성공 / MinIO 실패 또는 그 반대의 경우는 partial write로 기록한다.
- 삭제와 수정 이벤트는 별도 정책으로 관리하고, 기본은 soft-sync다.
- 상세 규칙은 `docs/architecture/folder-sync-pipeline.md`를 따른다.

## 5. 단계별 개발 계획

### Phase 0. 계약 고정
- `docs/architecture`, `docs/backend`, `docs/frontend`, `docs/integration`의 경계를 새 구조에 맞춘다.
- metadata schema, object key 규칙, collection 구조, 기본 API 표면을 고정한다.
- 종료 기준:
  - backend와 frontend가 같은 계약 문서를 기준으로 움직인다.

### Phase 1. Backend 골격
- `apps/backend`에 NestJS 기본 구조를 만든다.
- 우선 모듈:
  - `HealthModule`
  - `IngestModule`
  - `ImagesModule`
  - `SearchModule`
  - `StorageModule`
- 종료 기준:
  - `/health`, `/images`, `/images/:id`, `/images/:id/metadata`, `/images/:id/download`, `/ingest/scan`의 기본 뼈대가 준비된다.

### Phase 2. 저장소 계층
- MongoDB repository와 MinIO adapter를 분리한다.
- ingest는 `watch/scan -> pair match -> stabilize -> parse -> normalize -> MongoDB upsert -> MinIO put` 순서로 오케스트레이션한다.
- partial write와 idempotency를 설계한다.
- 종료 기준:
  - 같은 `imageId` 기준으로 MongoDB와 MinIO에 일관되게 저장된다.
  - 실패 상태가 숨겨지지 않고 추적 가능하다.

### Phase 3. 목록/검색 API
- MongoDB 기반 페이지네이션, 필터, 정렬, 상세 메타데이터 조회 API를 완성한다.
- `tags`, `공정코드`, `판정 결과`, 날짜 범위를 우선 지원한다.
- 종료 기준:
  - frontend가 전체 데이터셋을 들고 필터링하지 않는다.
  - 검색/목록 API만으로 화면이 구성된다.

### Phase 5. Frontend 구현
- `apps/frontend`의 SvelteKit 앱을 최종 사용자 UI로 구성한다.
- 개발 순서:
  - 목록 화면
  - 필터/페이지네이션
  - 상세 패널
  - 이미지 보기
  - 체크 기반 다운로드
- 종료 기준:
  - 목록/검색은 backend API를 사용한다.
  - 이미지 보기/다운로드는 MinIO 경로를 사용한다.

### Phase 6. E2E 검증
- ingest부터 UI 표시까지 전 구간을 검증한다.
- 확인 항목:
  - 목록
  - 필터
  - 상세
  - 보기
  - 다운로드
  - partial write
  - stale state
- 종료 기준:
  - MongoDB 성공 / MinIO 실패
  - MinIO 성공 / MongoDB 실패
  - backend 장애 / MinIO 장애 / frontend API 요청 실패를 각각 재현 가능하다.

### Phase 7. 성능 검증
- 데이터 규모:
  - 1,000건
  - 10,000건
  - 25,000건
- 관측 항목:
  - 초기 기동 시간
  - 첫 목록 응답 시간
  - 페이지 전환 지연
  - 필터 적용 지연
  - 상세 패널 갱신 시간
  - 이미지 보기/다운로드 지연
  - MongoDB query latency
  - MinIO GET/HEAD latency
  - frontend API 요청 실패율
- 종료 기준:
  - p50/p95가 기록된다.
  - 병목이 MongoDB, MinIO, backend, frontend 중 어디인지 추적 가능하다.

### Phase 8. Docker 배포
- `infra/docker`에 Docker Compose를 만든다.
- 포함 대상:
  - backend
  - MongoDB
  - MinIO
  - 필요 시 reverse proxy
- 종료 기준:
  - `docker compose up`으로 스택이 올라간다.
  - healthcheck와 volume이 포함된다.

## 6. 하위 에이전트별 책임

### Architecture agent
- 경계, 명명 규칙, 저장소 책임 분리
- 계약 문서 우선 관리

### Backend agent
- NestJS 모듈
- MongoDB 저장
- MinIO 저장/조회
- ingest, search, detail API

### Frontend agent
- SvelteKit UI
- 페이지네이션
- 필터 UX
- 이미지 보기/다운로드 UX

### Integration / QA agent
- E2E
- 실패 재현
- partial write 검증

### Performance agent
- 벤치마크
- 회귀 탐지
- 지표 기록

### Docs keeper
- 문서-코드 정합성
- stale section 제거
- spec/plan/review 동기화

### Review owner
- 용어 통일
- 경계 일치
- 게이트 통과 여부 판단

### Deployment / Packaging agent
- backend / frontend 분리 배포 구조
- 환경 변수 주입
- 배포 산출물과 패키징 기준

### 보관: Installer / Bootstrap agent
- 보관용
- 활성 운영 범위에서 제외

## 7. 총책임자 운영 방식
- 매 스텝 시작 전:
  - `docs/agent/playbook.md` 확인
  - 해당 역할 필수 문서 확인
- 매 스텝 종료 후:
  - 작업 로그 확인
  - 변경 파일 확인
  - 검증 결과 확인
  - 다음 에이전트 핸드오프 확인
- 반려 기준:
  - MongoDB와 MinIO의 역할이 섞인 경우
  - backend/frontend가 HTTP API 계약 문서와 다르게 동작하는 경우
  - partial write를 성공처럼 처리한 경우
  - 로그 없이 다음 단계로 넘어간 경우

## 8. 즉시 시작 순서
1. `apps/backend` NestJS skeleton 작성
2. MongoDB/MinIO 저장 계약 문서 확정
3. `apps/frontend` SvelteKit UI 정리
4. Docker Compose 초안 작성

## 9. 주요 리스크
- MongoDB와 MinIO 사이의 상태 불일치
- HTTP API 계약 없이 backend와 frontend가 따로 진화하는 문제
- 25,000건에서 frontend가 전체 데이터를 들고 있어 느려지는 문제
- Docker로 backend 스택을 묶었지만 frontend 연결이 복잡해지는 문제
