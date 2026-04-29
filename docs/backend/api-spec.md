# 쿠첸 백엔드 API 설계서

버전: `v0.2`
대상: `NestJS 백엔드`
배포 형태: `프론트 / 백엔드 분리 배포`

## 1. 목적

이 문서는 쿠첸 이미지 카탈로그 백엔드가 실제로 제공하는 HTTP API 계약을 정리한다.

- 프론트는 이 HTTP API만 호출한다.
- MongoDB는 목록/검색용 조회 정본이다.
- MinIO는 이미지 원본과 썸네일 저장소다.
- `rawJsonKey`는 원본 JSON 저장 경로를 나타내는 예약 필드지만, 현재 구현은 원본 JSON 객체 업로드까지 수행하지 않는다.
- JSON 응답은 공통 envelope를 사용하고, 스트리밍 응답만 예외로 둔다.

## 2. 공통 규칙

### 2.1 JSON 응답 envelope

모든 JSON 응답은 아래 형태를 따른다.

```json
{
  "success": true,
  "message": "ok",
  "data": {},
  "errorCode": null,
  "errorMessage": null
}
```

오류 응답도 같은 envelope를 사용한다.

```json
{
  "success": false,
  "message": "request failed",
  "data": null,
  "errorCode": "NOT_FOUND",
  "errorMessage": "image not found"
}
```

### 2.2 메타데이터 기준

현재 백엔드가 정규화하는 메타데이터 필드는 아래와 같다.

- `productNo`
- `capturedAt`
- `processCode`
- `result`
- `threshold`
- `lotNo`
- `processId`
- `version`
- `title`
- `inspectorModel`
- `inspectedAt`

입력 JSON에 version이 없으면 백엔드는 `metadata.version`을 기본 `v1`로 저장한다.

### 2.3 스트리밍 예외

다음 API는 JSON envelope가 아니라 binary stream을 반환한다.

- `GET /images/:imageId/blob`
- `GET /images/:imageId/thumbnail`
- `GET /images/:imageId/download`

다음 API는 JSON envelope가 아니라 `text/event-stream`을 반환한다.

- `GET /images/events`

## 3. API 목록

| Method | Path | 설명 |
| --- | --- | --- |
| `GET` | `/health` | 현재 설정과 실행 상태 확인 |
| `GET` | `/images/buckets` | 접근 가능한 MinIO 버킷 목록 조회 |
| `POST` | `/ingest/scan` | 입력 폴더 재귀 스캔 및 MongoDB/MinIO 동기화 |
| `GET` | `/images/search` | MongoDB 기반 목록 조회 및 필터 검색 |
| `GET` | `/images/:imageId/metadata` | 정규화 레코드 조회 |
| `GET` | `/images/:imageId` | 단건 레코드 조회 |
| `GET` | `/images/:imageId/blob` | 원본 이미지 스트리밍 |
| `GET` | `/images/:imageId/thumbnail` | 썸네일 스트리밍 |
| `GET` | `/images/:imageId/download` | 파일 저장용 원본 이미지 반환 |
| `GET` | `/images/events` | catalog 변경 이벤트 SSE 스트리밍 |

MinIO에 저장되는 이미지, 썸네일, metadata JSON 객체는 `metadata.version` 값이 있으면 user metadata `X-Amz-Meta-Version`에 같은 값을 포함한다.

## 4. 상세 명세

### 4.1 `GET /health`

현재 실행 상태와 주요 연결 설정을 확인한다.

#### 응답 데이터

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `ok` | `boolean` | 서버 응답 가능 여부 |
| `storageMode` | `string` | 현재 저장 모드 |
| `ingestRootDir` | `string` | 감시 루트 경로 |
| `minioEndpoint` | `string` | MinIO 연결 주소 |
| `bucket` | `string` | 기본 버킷명 |

### 4.2 `GET /images/buckets`

접근 가능한 MinIO 버킷 목록을 반환한다.

#### 응답 데이터

```json
{
  "buckets": ["jin-test", "archive"]
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `buckets` | `Array<string>` | 버킷 목록 |

### 4.3 `POST /ingest/scan`

입력 폴더를 재귀적으로 스캔해서 이미지와 JSON pair를 동기화한다.

#### 요청 바디

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `rootDir` | `string` | `N` | 스캔할 루트 폴더 |

#### 응답 데이터

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `processed` | `number` | 처리한 pair 수 |
| `synced` | `number` | 동기화 성공 수 |
| `partial` | `number` | 부분 성공 수 |
| `failed` | `number` | 실패 수 |
| `skipped` | `number` | 건너뛴 pair 수 |

### 4.4 `GET /images/search`

MongoDB를 기준으로 목록 조회와 필터 검색을 수행한다.

#### 지원 쿼리

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `bucket` | `string` | 버킷 필터 |
| `productNo` | `string` | 제품번호 포함 검색 |
| `processCode` | `string` | 공정코드 포함 검색 |
| `result` | `string` | 판정 결과 |
| `aiResult` | `string` | 이전 호환 필드 |
| `lotNo` | `string` | LOT 번호 포함 검색 |
| `processId` | `string` | 공정 ID 포함 검색 |
| `version` | `string` | metadata version 포함 검색 |
| `query` | `string` | 파일명 및 메타데이터 통합 검색어 |
| `capturedAtFrom` | `string` | 촬영일시 시작 |
| `capturedAtTo` | `string` | 촬영일시 종료 |
| `thresholdMin` | `number` | 판정 임계값 최소 |
| `thresholdMax` | `number` | 판정 임계값 최대 |
| `page` | `number` | 페이지 번호 |
| `pageSize` | `number` | 페이지 크기 |
| `productPage` | `string` | `1` 또는 `true`이면 이미지가 아니라 제품 기준으로 페이지네이션 |

#### 응답 데이터

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `total` | `number` | 총 건수. `productPage` 사용 시 총 제품 수 |
| `totalData` | `number` | `productPage` 사용 시 조건에 맞는 총 이미지 수 |
| `page` | `number` | 현재 페이지 |
| `pageSize` | `number` | 페이지 크기 |
| `items` | `Array<CatalogRecord>` | 목록 항목 |

### 4.5 `GET /images/:imageId/metadata`

선택한 이미지의 정규화 레코드를 반환한다.

#### 응답 데이터

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| `imageId` | `string` | 이미지 ID |
| `bucket` | `string` | 버킷명 |
| `fileName` | `string` | 파일명 |
| `fileExt` | `string` | 파일 확장자 |
| `sourcePath` | `string` | 로컬 원본 경로 |
| `contentHash` | `string` | 원본 해시 |
| `imageKey` | `string` | MinIO 원본 객체 키 |
| `thumbnailKey` | `string \| null` | MinIO 썸네일 객체 키 |
| `rawJsonKey` | `string \| null` | 원본 JSON 객체 키 |
| `metadata` | `object` | 정규화 메타데이터 |
| `syncStatus` | `string` | 동기화 상태 |
| `errorMessage` | `string \| null` | 부분 실패 메시지 |
| `createdAt` | `string` | 생성일 |
| `updatedAt` | `string` | 수정일 |

### 4.6 `GET /images/:imageId`

단건 레코드 조회다. 응답 형태는 `/images/:imageId/metadata`와 동일하다.

### 4.7 `GET /images/:imageId/blob`

원본 이미지를 스트리밍으로 반환한다.

#### 응답 헤더

- `Content-Type`

### 4.8 `GET /images/:imageId/thumbnail`

썸네일 이미지를 스트리밍으로 반환한다.

#### 응답 헤더

- `Content-Type`
- `Cache-Control`

### 4.9 `GET /images/:imageId/download`

파일 저장용 원본 이미지를 반환한다.

#### 응답 헤더

- `Content-Type`
- `Content-Disposition`

### 4.10 `GET /images/events`

catalog 변경 이벤트를 Server-Sent Events 형식으로 스트리밍한다.

#### 이벤트

| 이벤트명 | 설명 |
| --- | --- |
| `catalog.record.synced` | ingest가 이미지/JSON pair를 MongoDB와 MinIO에 동기화한 뒤 발행 |
| `catalog.ping` | 연결 유지를 위한 heartbeat |

#### `catalog.record.synced` 데이터

```json
{
  "type": "catalog.record.synced",
  "sequence": 1,
  "occurredAt": "2026-04-29T08:00:00.000Z",
  "record": {
    "imageId": "cuchen-00001-top",
    "productId": "CUCHEN-00001",
    "div": "top",
    "result": "OK",
    "version": "v1",
    "updatedAt": "2026-04-29T08:00:00.000Z"
  }
}
```

## 5. 저장 모델 요약

### 5.1 MongoDB `catalog`

조회 정본 문서만 저장한다.

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

### 5.2 MinIO 객체

- `images/{imageId}.{ext}`
- `thumbnails/{imageId}.webp`
- `metadata/{imageId}.json` (예약 경로, 현재 객체 업로드 미구현)

## 6. ingest 순서

1. 입력 폴더에서 이미지와 JSON을 basename 기준으로 pair 매칭한다.
2. JSON을 읽어 metadata를 정규화한다.
3. `imageId`를 생성한다.
4. MongoDB에 upsert 한다.
5. 이미지 원본을 MinIO에 저장한다.
6. 썸네일을 생성해 MinIO에 저장한다.
7. 부분 실패가 발생하면 상태를 남긴다.
