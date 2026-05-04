# 백엔드 명세

## 목적
이 문서는 SvelteKit 프론트엔드와 분리 배포되는 NestJS 백엔드의 책임, 공개 API, 저장 모델, 환경 계약을 고정한다.

## 역할
- 백엔드는 목록 조회, 필터 검색, 단건 메타데이터 조회, 이미지 원본/썸네일/다운로드 제공을 담당한다.
- 백엔드는 MongoDB와 MinIO를 함께 사용한다.
- 프론트는 백엔드 HTTP API만 호출하고, MongoDB나 MinIO에 직접 접근하지 않는다.

## 런타임 경계
- 기본 실행형에서 백엔드는 host/WSL Node.js 프로세스로 실행한다.
- 추후 Docker 실행형도 가능하지만, 이때 `POST /ingest/files`의 `path`는 컨테이너 내부 경로여야 한다.
- MongoDB는 조회 정본 저장소다.
- MinIO는 이미지 원본과 썸네일 저장소다.
- 원본 JSON은 `rawJsonKey`로 저장 위치를 예약해 두었지만, 현재 백엔드 구현은 원본 JSON 객체 업로드까지 수행하지 않는다.
- ingest 파이프라인은 자동 폴더 감시를 하지 않는다.
- 에이전트가 `path`와 `filebase`를 전달하면 백엔드는 `{filebase}-{div}.png`와 `{filebase}-{div}.json` 쌍만 ingest한다.
- 기본 실행형에서 `path`는 backend host/WSL 프로세스가 접근 가능한 실제 OS 경로다.

## 공개 HTTP API

### `GET /health`
- 백엔드 상태와 연결 정보를 반환한다.
- 주요 응답 항목
  - `ok`
  - `storageMode`
  - `ingestRootDir`
  - `minioEndpoint`
  - `bucket`

### `GET /images/buckets`
- 사용 가능한 버킷 목록을 반환한다.
- 프론트의 버킷 선택 드롭다운에 사용한다.

### `POST /ingest/scan`
- 지정한 입력 폴더를 재귀 스캔해 이미지/JSON 쌍을 ingest 한다.
- 요청 바디
  - `rootDir?`
- 응답
  - `processed`
  - `synced`
  - `partial`
  - `failed`
  - `skipped`

### `POST /ingest/files`
- 지정한 폴더와 filebase를 기준으로 `top`, `bot`, `top-inf`, `bot-inf` 4개 이미지/JSON 쌍을 ingest 한다.
- 요청 바디
  - `path`
  - `filebase`
- 일부 파일이 없으면 `400 Bad Request`로 거절하고 ingest를 시작하지 않는다.
- 성공한 파일은 원본 폴더에서 삭제한다.
- 실패한 pair는 `failed/` 폴더로 이동한다.
- 응답
  - `processed`
  - `synced`
  - `partial`
  - `failed`
  - `skipped`

### `GET /images/search`
- MongoDB 기준 목록 조회 및 필터 검색 API다.
- 지원 쿼리
  - `bucket`
  - `productNo`
  - `div`
  - `result`
  - `aiResult`
  - `lotNo`
  - `processId`
  - `version`
  - `query`
  - `capturedAtFrom`
  - `capturedAtTo`
  - `thresholdMin`
  - `thresholdMax`
  - `page`
  - `pageSize`
  - `productPage`
- `productPage=1` 또는 `productPage=true`이면 제품 기준으로 페이지네이션한다.
- 이때 `total`은 총 제품 수, `totalData`는 조건에 맞는 총 이미지 수다.

### `GET /images/:imageId/metadata`
- 선택한 이미지의 정규화된 레코드를 반환한다.

### `GET /images/:imageId`
- 메타데이터와 이미지 경로 요약을 함께 반환한다.

### `GET /images/:imageId/blob`
- 이미지 원본을 스트리밍으로 반환한다.

### `GET /images/:imageId/thumbnail`
- 썸네일을 스트리밍으로 반환한다.

### `GET /images/:imageId/download`
- 파일 저장용 원본 이미지를 반환한다.

## 저장 모델

### MongoDB 컬렉션 `catalog`
MongoDB는 조회 정본 문서만 저장한다.

주요 필드:
- `imageId`
- `bucket`
- `fileName`
- `fileExt`
- `sourcePath`
- `contentHash`
- `imageKey`
- `thumbnailKey`
- `rawJsonKey`
- `metadata`
- `syncStatus`
- `errorMessage`
- `createdAt`
- `updatedAt`

`metadata` 하위 필드:
- `productId`
- `capturedAt`
- `div`
- `result`
- `threshold`
- `lotNo`
- `processId`
- `version`
- 입력 JSON에 version이 없으면 기본 `v1`로 저장한다.

### MinIO 객체
- `images/{imageId}.{ext}`
- `thumbnails/{imageId}.webp`
- `metadata/{imageId}.json` (예약 경로, 현재 객체 업로드 미구현)
- `metadata.version` 값이 있으면 이미지, 썸네일, metadata JSON 객체의 MinIO user metadata `X-Amz-Meta-Version`에 같은 값을 저장한다.

## ingest 흐름
1. API로 전달된 `path`와 `filebase`를 기준으로 4개 div pair를 만든다.
2. JSON을 읽어 metadata를 정규화한다.
3. `imageId`를 생성한다.
4. MongoDB에 upsert한다.
5. 이미지 원본을 MinIO에 저장한다.
6. 썸네일을 생성해 MinIO에 저장한다.
7. 성공한 입력 파일은 삭제한다.
8. 실패한 pair는 `failed/` 폴더로 이동하고 상태를 남긴다.

## 환경 변수
- `MONGODB_URL`
- `MONGODB_DATABASE_NAME`
- `MONGODB_USER`
- `MONGODB_PASSWORD`
- `MONGODB_AUTH_SOURCE`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `INGEST_ROOT_DIR`
- `STORAGE_MODE`

## 검증 기준
- backend만으로 health, search, metadata, image blob, thumbnail, download가 동작해야 한다.
- frontend는 backend API만으로 목록과 상세를 구성해야 한다.
- MongoDB와 MinIO의 역할이 서로 바뀌지 않아야 한다.
- partial write와 retry 상태가 숨겨지지 않아야 한다.
