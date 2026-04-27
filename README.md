# Cuchen Workspace

이 저장소는 `MongoDB + MinIO + NestJS + SvelteKit` 구조로 개발하는 워크스페이스 루트다.

## 현재 상태
- 기존 JS/MinIO 프로토타입은 `legacy/minio-prototype/`로 분리했다.
- 앞으로 실제 개발은 `apps/`, `packages/`, `infra/` 아래에서만 진행한다.
- 각 프로젝트는 자기 폴더의 `package.json`, lock, `node_modules`를 관리한다.
- 백엔드 로컬 환경은 `apps/backend/.env`, Docker 환경은 `infra/docker/.env`를 사용한다.
- MongoDB / MinIO는 `infra/docker`의 Docker Compose를 별도로 실행해야 한다.
- Codex 실행 지침은 루트 `AGENTS.md`, 세부 에이전트 운영 규칙은 `docs/agent/`에 유지한다.

## 권장 구조

```text
apps/
  backend/      NestJS 백엔드
    generated/  백엔드 전용 감시 폴더와 임시 입력 데이터
  frontend/     SvelteKit 최종 사용자 UI
  desktop/      Electron 데스크톱 앱
packages/
  shared/       공용 타입, DTO, 유틸
infra/
  docker/       Docker Compose, 환경별 배포 파일
docs/           명세, 계획, 리뷰, 세부 에이전트 규칙
artifacts/      보고서, 로그, 벤치마크 결과
legacy/
  minio-prototype/  기존 프로토타입 보관
```

## 개발 원칙
- 새 코드는 루트에 직접 만들지 않는다.
- 백엔드 코드는 `apps/backend/`에만 둔다.
- SvelteKit 프론트엔드 코드는 `apps/frontend/`에 둔다.
- Electron 데스크톱 앱 코드는 `apps/desktop/`에 둔다.
- 공용 타입과 스키마는 `packages/shared/`로 모은다.
- Docker 관련 파일은 `infra/docker/`에서 관리한다.
- 루트의 `package.json`, `package-lock.json`, `node_modules`는 두지 않는다.
- 기존 프로토타입은 참고만 하고, 새 구현의 기준으로 삼지 않는다.

## 실행
- `cd packages/shared && npm run build`
- `cd apps/backend && npm run dev`
  - 기본 감시 폴더는 `apps/backend/generated/inbox`다.
  - MongoDB / MinIO 실연동을 보려면 먼저 `cd infra/docker && docker compose --env-file .env up -d`를 실행한다.
- `cd apps/backend && npm run test`
- `cd apps/frontend && npm run dev`
- `cd apps/frontend && npm test && npm run check && npm run build`
- `cd apps/desktop && npm run test`

## 실행 방법

### 1. 원격 MongoDB / MinIO에 붙여서 실행
이 저장소는 원격 MongoDB / MinIO에 붙는 설정으로도 동작한다. 실제 접속 정보는 `apps/backend/.env` 또는 운영 환경 변수에서 관리한다.

- MinIO endpoint: `MINIO_ENDPOINT`
- MinIO 계정: `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY`
- MinIO bucket: `MINIO_BUCKET`
- MongoDB: `MONGODB_URL`, `MONGODB_DATABASE_NAME`, `MONGODB_USER`, `MONGODB_PASSWORD`

실행 순서:

1. `apps/backend/.env`를 확인한다.
2. `cd apps/backend && npm run dev`로 백엔드를 띄운다.
3. MinIO에 이미 데이터가 있고 MongoDB가 비어 있거나 어긋나면 `cd apps/backend && npm run sync:minio-to-mongo`를 먼저 실행한다.
4. MongoDB 문서에 top-level 메타데이터 중복 컬럼이 남아 있으면 `cd apps/backend && npm run sync:prune-metadata-columns`를 실행한다.
5. 운영 중 데이터가 어긋나면 `cd apps/backend && npm run sync:reconcile-minio-mongo`를 주기적으로 실행한다.
6. `cd apps/frontend && npm run dev`로 SvelteKit UI를 띄운다.
7. 필요하면 `cd apps/frontend && npm test && npm run check && npm run build`로 frontend 검증을 돌린다.

### 2. Docker로 MongoDB / MinIO를 로컬에 띄워서 실행
로컬에서 MongoDB / MinIO를 직접 띄울 때만 Docker Compose를 사용한다.

1. `cd infra/docker`
2. `.env.example`을 기준으로 `.env`를 준비한다.
3. `docker compose --env-file .env up -d`를 실행한다.
4. `apps/backend/.env`의 `MONGODB_URL`, `MONGODB_DATABASE_NAME`, `MONGODB_USER`, `MONGODB_PASSWORD`, `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET`을 로컬 Docker 값에 맞춘다.
5. `cd apps/backend && npm run dev`
6. `cd apps/frontend && npm run dev`

## 현재 구현 상태
- backend는 폴더 감시, 수동 scan, metadata 검색, MinIO blob 조회까지 동작한다.
- backend에는 MinIO 상태를 MongoDB로 다시 맞추는 `sync:minio-to-mongo` 스크립트가 있다.
- backend에는 MongoDB의 top-level 메타데이터 중복 컬럼을 제거하는 `sync:prune-metadata-columns` 스크립트가 있다.
- backend에는 MinIO/MongoDB 정합성 배치인 `sync:reconcile-minio-mongo` 스크립트가 있다.
- frontend는 `apps/frontend`의 SvelteKit 앱이며 backend API를 호출한다.
- desktop은 `apps/desktop`의 Electron 앱이다.
- MongoDB / MinIO 실연동은 다음 단계에서 Docker infra와 함께 연결한다.

## 다음 시작점
1. `docs/README.md`
2. `docs/agent/README.md`
3. `apps/backend/`
4. `apps/frontend/`
