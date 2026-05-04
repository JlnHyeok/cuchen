# Backend Workspace

이 폴더는 새 NestJS 백엔드 구현 전용이다.

## 범위
- 파일 감지 및 ingest
- MongoDB metadata 저장
- MinIO 이미지 저장 및 조회
- 목록, 페이지네이션, 필터 API

## 로컬 데이터 위치
- 기본 감시 폴더는 `apps/backend/generated/inbox`다.
- 테스트나 수동 확인용 입력 파일도 이 경로 아래에 둔다.

## 실행
- `npm run dev`
  - shared를 먼저 빌드한 뒤 backend를 실행한다.
  - MongoDB / MinIO 실연동 설치와 배포 절차는 `../../docs/deployment/no-docker-install.md`를 따른다.
  - backend는 실행 시 `apps/backend/.env`를 자동으로 읽고, 시작 로그에 `storageMode`를 출력한다.
- `npm run test`
  - ingest service memory test를 실행한다.
- `npm run build`
  - TypeScript 빌드를 수행한다.
- `npm run sync:minio-to-mongo`
  - MinIO의 `images/` 객체를 기준으로 MongoDB `catalog` 컬렉션을 비우고 다시 채운다.
  - 현재는 원본 JSON이 없는 경우 이미지 객체 메타데이터만으로 Mongo 문서를 복원한다.
- `npm run sync:reconcile-minio-mongo`
  - MinIO와 MongoDB를 비교해서 누락 문서를 자동 보정하고, MongoDB에만 남은 항목은 `missing-source`로 표시한다.
- `npm run sync:prune-metadata-columns`
  - MongoDB 문서에 남아 있는 top-level 메타데이터 중복 컬럼(`productNo`, `capturedAt` 등)을 제거하고 nested `metadata`만 남긴다.
- `npm run sync:migrate-metadata-schema`
  - 기존 MongoDB 레코드의 메타데이터를 `product_id`, `div`, `time`, `result`, `threshold`, `prob` 스키마로 정규화한다.
  - `productNo`, `capturedAt`, `processCode`, `result`, `threshold`, `confidence`, `score` 같은 레거시 필드를 읽고, 변환 불가 문서는 스킵한다.
  - 이미 정규화된 문서는 다시 실행해도 건드리지 않는다.

## 실행 방법

### 로컬 메모리 모드
개발 초기에 백엔드 로직만 확인할 때 사용한다.

1. `cp .env.example .env`
2. `STORAGE_MODE=memory`로 둔다.
3. `npm run dev`

### MongoDB / MinIO 실연동 모드
Docker 없이 설치한 MongoDB / MinIO 또는 원격 MongoDB / MinIO를 연결할 때 사용한다.

1. `apps/backend/.env`에 아래 값을 넣는다.
   - `MINIO_ENDPOINT=http://127.0.0.1:9000`
   - `MINIO_ACCESS_KEY=<minio-access-key>`
   - `MINIO_SECRET_KEY=<minio-secret-key>`
   - `MINIO_BUCKET=cuchen-images`
   - `MONGODB_URL=mongodb://127.0.0.1:27017`
   - `MONGODB_DATABASE_NAME=cuchen`
   - `MONGODB_USER=<mongodb-user>`
   - `MONGODB_PASSWORD=<mongodb-password>`
2. `STORAGE_MODE=mongo-minio`로 둔다.
3. `npm run dev`
4. backend가 시작되면 MongoDB에 collection을 먼저 생성하고, ingest가 들어오면 문서가 쌓인다.

### MinIO 상태를 MongoDB에 다시 맞추는 경우
MinIO에 이미 데이터가 있고 MongoDB가 비어 있거나 어긋난 경우 이 명령을 사용한다.

1. `STORAGE_MODE=mongo-minio`로 둔다.
2. `npm run sync:minio-to-mongo`
3. 완료 후 `npm run dev`를 실행하면 MongoDB와 MinIO가 같은 기준으로 동작한다.

### 주기적 정합성 배치가 필요한 경우
운영 중 업로드 중단이나 네트워크 오류로 양쪽이 어긋나면 이 명령을 주기적으로 실행한다.

1. `STORAGE_MODE=mongo-minio`로 둔다.
2. `npm run sync:reconcile-minio-mongo`
3. 결과 로그를 확인하고, `missing-source`가 남아 있으면 원인을 별도로 확인한다.

### 기존 MongoDB 문서의 top-level metadata 중복 컬럼을 제거하는 경우
이미 저장된 문서에 top-level 메타데이터 컬럼이 남아 있는 경우 먼저 이 명령을 실행한다.

1. `STORAGE_MODE=mongo-minio`로 둔다.
2. `npm run sync:prune-metadata-columns`
3. 이후 `npm run dev` 또는 `npm run sync:reconcile-minio-mongo`를 실행한다.

### 배포 문서
Ubuntu/Windows에서 Docker 없이 MongoDB, MinIO, backend, frontend를 설치/배포하는 절차는 `../../docs/deployment/no-docker-install.md`를 따른다.
