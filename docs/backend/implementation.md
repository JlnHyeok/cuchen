# 백엔드 구현 설명과 API 설계서 정합성 검토

작성일: 2026-04-24

이 문서는 현재 `apps/backend` 백엔드가 어떤 기술로 어떤 기능을 구현했는지 설명하고, `docs/backend/쿠첸_API설계_v0.2.xlsx`와 실제 코드가 맞는지 검토한 결과를 정리한다.

## 한 줄 요약

현재 백엔드는 NestJS로 만든 HTTP API 서버다. MongoDB는 이미지 목록과 메타데이터를 빠르게 검색하기 위한 저장소로 쓰고, MinIO는 실제 이미지 원본과 썸네일 파일을 저장하는 객체 저장소로 쓴다.

## 사용 기술

### Node.js와 TypeScript

백엔드는 Node.js 런타임에서 실행된다. 코드는 TypeScript로 작성되어 있어서, 문자열과 숫자처럼 데이터 타입을 미리 검증하면서 개발할 수 있다.

선정 이유:

- 프론트엔드, 데스크톱, 백엔드가 모두 JavaScript/TypeScript 생태계에 있어 타입과 유틸리티를 공유하기 쉽다.
- `packages/shared`에 공용 타입을 두면 API 응답 구조가 바뀌었을 때 프론트엔드와 백엔드의 불일치를 빨리 발견할 수 있다.
- 이미지 목록 조회, 파일 감시, HTTP API처럼 I/O가 많은 서버 작업에 Node.js의 비동기 처리 모델이 잘 맞는다.

예를 들어 이미지 레코드는 `CatalogRecord`라는 공용 타입으로 정의되어 있다. 이 타입에는 `imageId`, `bucket`, `fileName`, `metadata`, `syncStatus` 같은 필드가 들어간다. 프론트엔드와 백엔드가 같은 데이터 모양을 공유할 수 있도록 `packages/shared`에 공용 타입을 둔다.

관련 코드:

- [packages/shared/src/index.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/packages/shared/src/index.ts:23)
- [packages/shared/src/index.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/packages/shared/src/index.ts:40)

### NestJS

NestJS는 Node.js 서버를 모듈, 컨트롤러, 서비스 단위로 나누어 만드는 프레임워크다.

선정 이유:

- API 서버 구조가 명확하다. HTTP 요청을 받는 Controller와 실제 로직을 수행하는 Service를 분리할 수 있다.
- MongoDB, 설정, 전역 validation, 전역 error filter처럼 백엔드 공통 관심사를 모듈 단위로 등록하기 좋다.
- 기능이 늘어도 `ImagesModule`, `IngestModule`, `StorageModule`처럼 책임을 나눌 수 있어 유지보수가 쉽다.
- 테스트에서 실제 HTTP 서버를 띄우거나 특정 provider를 메모리 구현으로 바꿔 끼우기 쉽다.

- Controller: HTTP 요청을 받는 입구
- Service: 실제 업무 로직을 처리하는 곳
- Module: 관련 기능을 묶어서 NestJS에 등록하는 단위

현재 백엔드는 아래 모듈로 구성되어 있다.

| 모듈 | 역할 |
| --- | --- |
| `HealthModule` | 서버 상태 확인 API 제공 |
| `CatalogModule` | 이미지 목록 검색과 catalog 조회 API 제공 |
| `ImagesModule` | 이미지 메타데이터 조회, 원본/썸네일/다운로드 제공 |
| `IngestModule` | 입력 폴더 스캔, 파일 감시, MongoDB/MinIO 동기화 |
| `StorageModule` | MongoDB/MinIO 또는 메모리 저장소 연결 |

현재 백엔드 폴더는 기능 단위로 먼저 나누고, 각 기능 내부에서 API, application, domain, infrastructure 책임을 나누는 방식으로 정리했다.

```text
apps/backend/src/
  common/
    config/
    http/
  catalog/
    api/
    application/
    domain/
    infrastructure/
  images/
    api/
    application/
    domain/
    infrastructure/
  ingest/
    api/
    application/
  storage/
    storage.module.ts
    storage.tokens.ts
```

이 구조를 선택한 이유:

- `catalog`, `images`, `ingest`처럼 업무 기능 단위로 먼저 찾을 수 있다.
- MongoDB, MinIO, memory 구현은 `infrastructure` 아래에 둬서 외부 기술 의존성을 분리한다.
- Controller는 `api`, 실제 업무 흐름은 `application`, 인터페이스는 `domain`에 둬 테스트와 교체가 쉽다.
- `storage`는 실제 저장 구현 폴더가 아니라 NestJS DI provider를 조립하는 얇은 모듈로 남겼다.

관련 코드:

- [apps/backend/src/app.module.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/app.module.ts:27)

### MongoDB와 Mongoose

MongoDB는 이미지 검색을 위한 기준 저장소다. 실제 이미지 파일을 MongoDB에 넣는 것이 아니라, 검색에 필요한 메타데이터와 MinIO 객체 경로를 저장한다.

Mongoose는 TypeScript/NestJS 코드에서 MongoDB 컬렉션을 쉽게 다루게 해주는 라이브러리다. 현재 `catalog` 컬렉션에 이미지 레코드를 저장하고, 자주 검색하는 메타데이터 필드에는 인덱스를 둔다.

선정 이유:

- 이미지 메타데이터는 제품번호, 촬영일시, 판정 결과, LOT, CAMERA처럼 조건 검색이 많기 때문에 객체 저장소보다 DB 검색이 적합하다.
- MongoDB는 JSON 형태의 유동적인 metadata를 저장하기 쉽다. 현장 JSON 필드명이 조금씩 달라도 nested metadata로 보존할 수 있다.
- Mongoose는 schema, index, repository 구현을 NestJS와 연결하기 쉽다.
- `upsert`를 사용하면 같은 파일이 다시 들어와도 중복 insert가 아니라 같은 `imageId` 기준으로 갱신할 수 있다.

주요 저장 필드:

- `imageId`: 이미지 고유 ID
- `bucket`: MinIO 버킷명
- `fileName`: 파일명
- `imageKey`: MinIO 원본 이미지 객체 키
- `thumbnailKey`: MinIO 썸네일 객체 키
- `rawJsonKey`: 원본 JSON 객체 키로 쓰기 위한 값
- `metadata`: 제품번호, 촬영일시, 공정코드, 판정 결과, LOT, CAMERA 등
- `syncStatus`: 동기화 상태

관련 코드:

- [apps/backend/src/catalog/infrastructure/mongo/catalog.schema.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/infrastructure/mongo/catalog.schema.ts:36)
- [apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts:20)

### MinIO

MinIO는 S3와 비슷한 방식의 객체 저장소다. 일반 파일 시스템처럼 폴더에 직접 저장하는 대신, 버킷 안에 `images/...`, `thumbnails/...` 같은 키로 파일을 저장한다.

선정 이유:

- 원본 이미지는 DB에 넣기보다 객체 저장소에 두는 편이 단순하고 확장하기 쉽다.
- S3 호환 API라 운영 환경에서 S3 계열 저장소로 옮기거나 연동하기 쉽다.
- 이미지 원본과 썸네일을 key 기준으로 분리할 수 있어 다운로드, 미리보기, 캐시 정책을 나누기 좋다.
- 백엔드가 MinIO 접근을 대신 처리하므로 프론트엔드는 저장소 계정이나 내부 경로를 몰라도 된다.

현재 구현은 다음 파일을 MinIO에 저장한다.

| 객체 | 저장 위치 |
| --- | --- |
| 원본 이미지 | `images/{imageId}.{ext}` |
| 썸네일 | `thumbnails/{imageId}.webp` |

주의할 점은, 현재 코드가 `rawJsonKey` 값은 만들지만 원본 JSON 파일 자체를 MinIO에 업로드하는 메서드는 아직 없다는 점이다. 즉 `metadata/{imageId}.json` 경로는 레코드에 남지만 실제 객체 저장까지 구현된 상태는 아니다.

왜 주의해야 하는가:

- `rawJsonKey`만 보고 실제 MinIO에 JSON 객체가 있다고 가정하면 복구, 감사, 원본 재처리 기능에서 404가 발생할 수 있다.
- 운영자가 “원본 JSON도 MinIO에 보관된다”고 이해하면 백업 범위를 잘못 잡을 수 있다.

현재 해결 방식:

- 문서와 엑셀 설계서에 `rawJsonKey`를 “예약 경로, 현재 객체 업로드 미구현”으로 명시했다.
- 실제 API는 원본 JSON 다운로드 API를 제공하지 않는다. 따라서 현재 기능 범위에서는 원본 이미지와 썸네일 저장만 보장한다.
- 원본 JSON 보관이 요구사항으로 확정되면 `BlobStorage`에 `putRawJson()` / `openRawJson()`을 추가하고 ingest 단계에서 JSON 원문을 업로드해야 한다.

관련 코드:

- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:98)
- [apps/backend/src/images/infrastructure/minio/object.storage.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/images/infrastructure/minio/object.storage.ts:32)

### Sharp

Sharp는 이미지 처리 라이브러리다. 백엔드는 원본 이미지를 받아서 목록과 상세 화면에서 빠르게 보여줄 수 있는 WebP 썸네일을 만든다.

선정 이유:

- Node.js 이미지 처리에서 널리 쓰이고, PNG/JPEG/WebP 변환과 resize 성능이 좋다.
- 원본 이미지를 그대로 목록에 쓰면 네트워크와 렌더링 비용이 커지므로, 서버에서 썸네일을 만들어 두는 편이 사용자 경험에 유리하다.
- EXIF 회전 정보를 반영할 수 있어 촬영 장비에 따라 이미지 방향이 틀어지는 문제를 줄일 수 있다.

현재 썸네일 규칙:

- 최대 크기: 512px
- 포맷: WebP
- 품질: 76
- EXIF 회전 정보가 있으면 자동 반영

관련 코드:

- [apps/backend/src/images/thumbnail.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/images/thumbnail.ts:3)

### Chokidar

Chokidar는 폴더 변경 감시 라이브러리다. 백엔드는 `INGEST_ROOT_DIR` 폴더를 감시하다가 `.png`, `.jpg`, `.jpeg`, `.json` 파일이 들어오면 같은 basename을 가진 이미지와 JSON을 한 쌍으로 보고 ingest를 수행한다.

선정 이유:

- 운영자가 특정 입력 폴더에 파일을 넣기만 해도 자동 ingest가 가능하다.
- Node.js 기본 `fs.watch`보다 플랫폼별 파일 감시 차이를 더 잘 흡수한다.
- `awaitWriteFinish` 옵션으로 파일 복사 중간에 덜 완성된 파일을 처리하는 위험을 줄일 수 있다.
- 수동 `POST /ingest/scan`과 자동 감시를 함께 둘 수 있어 초기 적재와 실시간 적재를 모두 처리할 수 있다.

예를 들어 아래 두 파일이 있으면 하나의 pair로 처리한다.

```text
sample-001.png
sample-001.json
```

관련 코드:

- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:121)
- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:177)

### class-validator와 ValidationPipe

API 요청으로 들어오는 query/body 값을 검증하기 위해 `class-validator`와 NestJS `ValidationPipe`를 사용한다.

선정 이유:

- query parameter는 HTTP에서는 문자열로 들어오기 때문에 `page=1`, `thresholdMin=0.5` 같은 값을 숫자로 변환하고 검증해야 한다.
- DTO 클래스에 `@IsString`, `@IsNumber`, `@IsOptional`을 붙이면 요청 검증 규칙을 Controller 근처에서 바로 볼 수 있다.
- 잘못된 요청을 서비스 로직까지 보내지 않고 API 입구에서 차단할 수 있다.

예를 들어 `page`, `pageSize`, `thresholdMin`, `thresholdMax`는 문자열로 들어와도 숫자로 변환되며, 숫자가 아니면 요청 검증에서 걸린다.

관련 코드:

- [apps/backend/src/main.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/main.ts:12)
- [apps/backend/src/catalog/api/dto/search.request.dto.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/api/dto/search.request.dto.ts:4)

## 전체 동작 흐름

### 1. 서버 시작

서버가 시작되면 환경 변수를 읽어 설정을 만든다. `STORAGE_MODE`가 `mongo-minio`이면 MongoDB와 MinIO를 사용하고, 그 외에는 테스트용 메모리 저장소를 사용한다.

이후 NestJS 애플리케이션이 만들어지고, 전역 validation, CORS, 공통 응답 envelope, 공통 에러 envelope가 등록된다.

관련 코드:

- [apps/backend/src/common/config/app-config.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/common/config/app-config.ts:45)
- [apps/backend/src/storage/storage.module.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/storage/storage.module.ts:19)
- [apps/backend/src/common/http/api-response.interceptor.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/common/http/api-response.interceptor.ts:11)
- [apps/backend/src/common/http/api-exception.filter.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/common/http/api-exception.filter.ts:11)

### 2. 입력 폴더 스캔과 파일 감시

백엔드는 시작할 때 `INGEST_ROOT_DIR` 폴더를 만들고, 기존 파일을 한 번 스캔한다. 그 뒤에는 폴더를 계속 감시한다.

스캔할 때는 이미지 파일과 JSON 파일을 basename 기준으로 묶는다. 이미지나 JSON 중 하나만 있으면 처리하지 않는다.

관련 코드:

- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:32)
- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:51)

### 3. 메타데이터 정규화

현장 JSON은 필드명이 항상 같지 않을 수 있다. 예를 들어 제품번호가 `productNo`, `productNumber`, `sku`, `제품번호`, `품번` 중 하나로 들어올 수 있다.

백엔드는 이런 alias를 표준 필드로 정리한다.

| 표준 필드 | 허용 alias 예시 |
| --- | --- |
| `productNo` | `productNo`, `productNumber`, `sku`, `제품번호`, `품번` |
| `capturedAt` | `capturedAt`, `captured_at`, `shotAt`, `촬영일시` |
| `processCode` | `processCode`, `process_code`, `공정코드` |
| `result` | `result`, `aiResult`, `inspectionResult`, `판정결과` |
| `threshold` | `threshold`, `inspectionThreshold`, `임계치` |
| `lotNo` | `lotNo`, `lot_no`, `lot`, `lotNumber` |
| `cameraId` | `cameraId`, `camera_id`, `camera`, `카메라` |

관련 코드:

- [packages/shared/src/index.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/packages/shared/src/index.ts:78)
- [packages/shared/src/index.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/packages/shared/src/index.ts:95)

### 4. imageId 생성

백엔드는 파일 경로와 이미지 내용을 함께 해시해서 `imageId`를 만든다. 같은 파일이 다시 들어와도 같은 ID가 만들어져서 MongoDB에 중복 insert가 아니라 upsert로 처리된다.

관련 코드:

- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:203)

### 5. MongoDB와 MinIO 동기화

하나의 pair가 들어오면 다음 순서로 처리한다.

1. 이미지 파일을 Buffer로 읽는다.
2. JSON 파일을 읽고 메타데이터를 정규화한다.
3. `imageId`와 저장 키를 만든다.
4. MongoDB에 레코드를 먼저 upsert한다.
5. MinIO에 원본 이미지를 저장한다.
6. Sharp로 썸네일을 만든다.
7. MinIO에 썸네일을 저장한다.
8. MongoDB에 최종 레코드를 다시 upsert한다.

중간에 실패하면 `syncStatus`를 `partial`로 바꾸고 `errorMessage`를 남긴다. 이렇게 해야 운영자가 “파일은 일부 들어갔는데 완전히 성공하지 않은 상태”를 나중에 추적할 수 있다.

관련 코드:

- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:84)
- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:107)

### 6. 목록 검색

`GET /images/search`는 MongoDB에서 목록을 검색한다. 이미지를 직접 MinIO에서 훑지 않는다. 이유는 MinIO는 파일 저장에 적합하고, 조건 검색과 페이지네이션은 MongoDB가 더 적합하기 때문이다.

지원하는 검색 조건:

- `bucket`
- `productNo`
- `processCode`
- `result`
- `aiResult`
- `query`
- `capturedAtFrom`
- `capturedAtTo`
- `thresholdMin`
- `thresholdMax`
- `page`
- `pageSize`
- `productPage`

`productNo`, `lotNo`, `cameraId`는 포함 검색이고, `query`는 이미지 ID, 파일명, 제품번호, 공정코드, 판정 결과, LOT, CAMERA를 넓게 검색한다.

프론트엔드 목록 화면은 제품 1개를 대표 row 1개로 보여준다. 이때 이미지 단위 페이지를 여러 번 호출해서 제품 수를 맞추면 141페이지처럼 뒤쪽으로 이동할 때 `/images/search?page=2&pageSize=1000`, `/images/search?page=3&pageSize=1000` 같은 요청이 연속으로 발생한다. 이를 막기 위해 `productPage=1`을 지원한다. 이 옵션을 쓰면 MongoDB에서 먼저 제품 단위로 그룹핑하고, 현재 페이지에 필요한 제품들의 이미지 레코드만 한 번에 반환한다.

관련 코드:

- [apps/backend/src/catalog/api/catalog.controller.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/api/catalog.controller.ts:80)
- [apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts:61)

### 7. 이미지 조회와 다운로드

이미지 관련 API는 크게 두 종류다.

첫째, JSON으로 메타데이터를 반환하는 API다.

- `GET /images/:imageId/metadata`
- `GET /images/:imageId`

둘째, binary stream으로 이미지 파일을 직접 반환하는 API다.

- `GET /images/:imageId/blob`
- `GET /images/:imageId/thumbnail`
- `GET /images/:imageId/download`

JSON API는 공통 envelope로 감싸진다. 반면 이미지 스트리밍 API는 실제 이미지 바이트를 보내야 하므로 envelope를 쓰지 않는다.

관련 코드:

- [apps/backend/src/images/api/images.controller.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/images/api/images.controller.ts:15)
- [apps/backend/src/images/api/images.controller.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/images/api/images.controller.ts:25)

## 구현된 API 목록

`쿠첸_API설계_v0.2.xlsx`의 API 9개는 실제 코드에 모두 존재한다.

| 설계서 Method | 설계서 Path | 실제 구현 | 판정 |
| --- | --- | --- | --- |
| `GET` | `/health` | `HealthController.health()` | 일치 |
| `GET` | `/images/buckets` | `ImagesController.buckets()` | 부분 일치 |
| `POST` | `/ingest/scan` | `IngestController.scan()` | 일치 |
| `GET` | `/images/search` | `CatalogController.search()` | 대부분 일치 |
| `GET` | `/images/:imageId/metadata` | `ImagesController.metadata()` | 일치 |
| `GET` | `/images/:imageId` | `ImagesController.detail()` | 일치 |
| `GET` | `/images/:imageId/blob` | `ImagesController.blob()` | 일치 |
| `GET` | `/images/:imageId/thumbnail` | `ImagesController.thumbnail()` | 일치 |
| `GET` | `/images/:imageId/download` | `ImagesController.download()` | 일치 |

## API 설계서 정합성 검토

### 일치하는 부분

#### 공통 envelope

설계서는 JSON 응답이 아래 형태를 따른다고 정의한다.

```json
{
  "success": true,
  "message": "ok",
  "data": {},
  "errorCode": null,
  "errorMessage": null
}
```

실제 코드도 전역 interceptor에서 일반 JSON 응답을 `okEnvelope`로 감싼다. 오류도 전역 exception filter에서 같은 envelope 형태로 반환한다.

관련 코드:

- [apps/backend/src/common/http/api-response.interceptor.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/common/http/api-response.interceptor.ts:11)
- [apps/backend/src/common/http/api-exception.filter.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/common/http/api-exception.filter.ts:21)

#### 스트리밍 API 예외

설계서에서는 이미지 스트리밍 API가 JSON envelope를 쓰지 않는다고 정리되어 있다. 실제 코드도 `@Res()`와 `pipeline()`으로 binary stream을 직접 반환한다.

관련 코드:

- [apps/backend/src/images/api/images.controller.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/images/api/images.controller.ts:25)

#### 검색 API 기본 필드

설계서의 검색 query 대부분이 실제 DTO에 있다.

| query | 실제 지원 |
| --- | --- |
| `bucket` | 지원 |
| `productNo` | 지원 |
| `processCode` | 지원 |
| `result` | 지원 |
| `aiResult` | 지원 |
| `lotNo` | 지원 |
| `cameraId` | 지원 |
| `query` | 지원 |
| `capturedAtFrom` | 지원 |
| `capturedAtTo` | 지원 |
| `thresholdMin` | 지원 |
| `thresholdMax` | 지원 |
| `page` | 지원 |
| `pageSize` | 지원 |
| `productPage` | 지원 |

관련 코드:

- [apps/backend/src/catalog/api/dto/search.request.dto.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/api/dto/search.request.dto.ts:4)

#### 목록 응답

설계서는 `total`, `page`, `pageSize`, `items`를 정의한다. 실제 MongoDB repository도 같은 필드를 반환한다. 제품 단위 페이지네이션인 `productPage=1`을 사용할 때는 `total`이 총 제품 수이고, `totalData`가 조건에 맞는 총 이미지 수다.

관련 코드:

- [apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts:29)

#### 메타데이터 응답

설계서의 `CatalogRecord` 주요 필드는 실제 공용 타입과 맞는다.

관련 코드:

- [packages/shared/src/index.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/packages/shared/src/index.ts:23)

### 보완 또는 주의가 필요한 부분

#### 1. `/images/buckets`는 실제 MinIO 전체 버킷 목록이 아니다

설계서에는 “접근 가능한 MinIO 버킷 목록 조회”라고 되어 있다. 하지만 실제 코드는 MinIO 서버의 전체 버킷을 조회하지 않는다. 현재 설정의 기본 버킷과 MongoDB catalog에 저장된 bucket 값들을 합쳐서 반환한다.

왜 주의해야 하는가:

- “접근 가능한 MinIO 버킷 목록”이라고 쓰면 MinIO 계정 권한으로 볼 수 있는 전체 버킷을 반환한다고 오해할 수 있다.
- 실제로는 catalog에 기록된 bucket과 기본 bucket을 반환하므로, 아직 catalog에 데이터가 없는 버킷은 보이지 않을 수 있다.

현재 해결 방식:

- 현재 프론트엔드 목적은 “검색 가능한 이미지가 있는 버킷을 선택”하는 것이므로 catalog 기준 반환 방식을 유지했다.
- `쿠첸_API설계_v0.2.xlsx`와 문서 설명을 “설정 기본 버킷과 catalog 기준 버킷 목록”으로 고쳤다.
- 나중에 진짜 MinIO 전체 버킷 조회가 필요하면 `MinioObjectStorage`에 `listBuckets()` 계열 메서드를 추가하고 API 의미를 분리하는 것이 맞다.

관련 코드:

- [apps/backend/src/images/application/images.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/images/application/images.service.ts:58)
- [apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts:53)

#### 2. ingest `processed`는 파일 수가 아니라 pair 수다

엑셀 설계서의 인제스트 시트에는 `processed` 설명이 “처리한 파일 수”로 되어 있다. 실제 코드는 이미지+JSON pair 하나를 처리 단위로 보고 `processed`를 1 증가시킨다.

예를 들어 `sample.png`와 `sample.json`을 처리하면 파일은 2개지만 `processed`는 1이다.

왜 주의해야 하는가:

- 운영자가 `processed=100`을 파일 100개로 이해하면 실제로는 이미지/JSON 100쌍, 즉 최대 200개 파일을 처리한 것과 차이가 생긴다.
- 성공률을 계산할 때 파일 수 기준인지 pair 수 기준인지가 섞이면 ingest 품질 지표가 틀어진다.

현재 해결 방식:

- 코드의 동작은 pair 기준으로 유지했다. 백엔드가 이미지와 JSON을 함께 가져야 하나의 catalog record를 만들 수 있기 때문이다.
- 문서와 `쿠첸_API설계_v0.2.xlsx`의 설명을 “처리한 이미지/JSON pair 수”로 수정했다.
- `skipped`도 같은 기준에 맞춰 “건너뛴 pair 수”로 정리했다.

관련 코드:

- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:57)

#### 3. `result`는 단순 정확 일치보다 넓게 동작한다

설계서 공통규약에는 `result`가 정확 일치라고 되어 있다. 실제 코드는 `OK`와 `PASS`를 같은 그룹으로 보고, `NG`, `FAIL`, `FAILED`도 같은 그룹으로 본다.

왜 주의해야 하는가:

- 설계서만 보고 `result=OK`가 오직 `OK` 문자열만 찾는다고 생각하면 실제 검색 결과가 예상보다 넓게 보일 수 있다.
- 현장 데이터가 `OK/PASS`, `NG/FAIL/FAILED`처럼 섞여 들어오는 상황에서는 정확 일치보다 alias 매칭이 사용자 기대에 더 맞다.

현재 해결 방식:

- 구현은 alias 매칭을 유지했다.
- 문서와 엑셀에 “OK/PASS, NG/FAIL/FAILED alias 매칭”이라고 명시했다.
- 테스트에서도 `result: "OK"` 검색이 `PASS` 데이터를 찾는 흐름을 검증한다.

관련 코드:

- [apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts:133)

#### 4. LOT, CAMERA 직접 필터

현재 metadata에는 `lotNo`, `cameraId`가 있고, `query` 통합 검색에도 들어간다. 또한 `GET /images/search?lotNo=...&cameraId=...`처럼 별도 query parameter로 직접 필터링할 수 있다.

프론트엔드 검색 필터의 LOT, CAMERA 입력칸은 이 백엔드 query parameter로 전달된다.

구현 기준:

- `SearchFilters`에 `lotNo`, `cameraId`가 있다.
- `SearchRequestDto`에 `lotNo`, `cameraId`가 있다.
- MongoDB query에 `metadata.lotNo`, `metadata.cameraId` 조건이 있다.
- `쿠첸_API설계_v0.2.xlsx`에 query parameter로 반영되어 있다.

관련 코드:

- [packages/shared/src/index.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/packages/shared/src/index.ts:40)
- [apps/backend/src/catalog/api/dto/search.request.dto.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/api/dto/search.request.dto.ts:4)
- [apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/catalog/infrastructure/mongo/catalog.repository.ts:118)

#### 5. 원본 JSON MinIO 저장은 아직 완성되지 않았다

레코드에는 `rawJsonKey`가 `metadata/{imageId}.json` 형태로 들어간다. 하지만 현재 `BlobStorage` 인터페이스와 `MinioObjectStorage` 구현에는 원본 JSON을 저장하는 메서드가 없다.

즉 설계상으로는 원본 JSON 저장 위치를 기록하지만, 실제 저장은 원본 이미지와 썸네일까지만 수행한다.

왜 주의해야 하는가:

- `rawJsonKey`가 있으니 JSON 원문도 MinIO에 있다고 생각하기 쉽지만, 현재는 실제 객체가 없다.
- 나중에 원본 JSON 재다운로드, 재처리, 감사 기능을 만들 때 이 차이를 모르고 구현하면 런타임 오류가 난다.

현재 해결 방식:

- 현재 기능 범위에서는 원본 이미지와 썸네일 저장만 보장한다.
- `rawJsonKey`는 “예약 필드”로 문서화했고, 엑셀에도 “현재 객체 업로드 미구현”이라고 반영했다.
- 원본 JSON 보관이 필요해지면 `BlobStorage`에 `putRawJson()` / `openRawJson()`을 추가하고 ingest 단계에서 `jsonRaw`를 업로드해야 한다.

관련 코드:

- [apps/backend/src/ingest/application/ingest.service.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/ingest/application/ingest.service.ts:100)
- [apps/backend/src/images/domain/blob.storage.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/images/domain/blob.storage.ts:13)

#### 6. 다운로드 파일명은 원본 파일명이 아니라 imageId다

설계서에는 `Content-Disposition` attachment 헤더가 있다고만 되어 있다. 실제 다운로드 헤더의 파일명은 원본 파일명이 아니라 `imageId`다.

왜 주의해야 하는가:

- 사용자는 저장된 파일명이 원본 파일명과 같을 것으로 기대할 수 있다.
- 현재처럼 `imageId` 기준으로 내려주면 중복 파일명 충돌은 줄어들지만, 사람이 파일을 직접 봤을 때 원본명을 바로 알기 어렵다.

현재 해결 방식:

- 현재 구현은 고유성을 우선해 `imageId`를 파일명으로 사용한다.
- 엑셀 설계서에는 “파일명은 현재 imageId 기준”이라고 명시했다.
- 사용자 친화적 파일명이 중요해지면 `record.fileName`과 `fileExt`를 조합하되, 중복 방지를 위해 `imageId` 일부를 suffix로 붙이는 방식이 적절하다.

관련 코드:

- [apps/backend/src/images/api/images.controller.ts](/Users/jinhyeokheo/Roylabs/Project/cuchen2/apps/backend/src/images/api/images.controller.ts:40)

## 초보자를 위한 예시

### 새 이미지가 들어왔을 때

입력 폴더에 아래 파일이 들어왔다고 가정한다.

```text
apps/backend/generated/inbox/PRD-0001.png
apps/backend/generated/inbox/PRD-0001.json
```

JSON 내용이 아래와 같다면:

```json
{
  "제품번호": "PRD-0001",
  "촬영일시": "2026-04-24T10:00:00.000Z",
  "공정코드": "TOP",
  "판정결과": "OK",
  "lotNo": "LOT-001",
  "cameraId": "CAM-TOP",
  "임계치": 0.82
}
```

백엔드는 이를 아래처럼 표준화한다.

```json
{
  "productNo": "PRD-0001",
  "capturedAt": "2026-04-24T10:00:00.000Z",
  "processCode": "TOP",
  "result": "OK",
  "lotNo": "LOT-001",
  "cameraId": "CAM-TOP",
  "threshold": 0.82
}
```

그 다음 MongoDB에는 검색용 레코드를 저장하고, MinIO에는 원본 이미지와 WebP 썸네일을 저장한다.

### 프론트엔드가 목록을 볼 때

프론트엔드는 MongoDB나 MinIO에 직접 접근하지 않는다. 대신 백엔드에 아래처럼 요청한다.

```http
GET /images/search?page=1&pageSize=20&productNo=PRD
```

백엔드는 MongoDB에서 조건에 맞는 레코드를 찾고, 아래처럼 envelope로 감싸서 반환한다.

```json
{
  "success": true,
  "message": "ok",
  "data": {
    "total": 143,
    "page": 1,
    "pageSize": 20,
    "items": []
  },
  "errorCode": null,
  "errorMessage": null
}
```

프론트엔드는 `items`를 표에 그리고, 각 항목의 썸네일은 별도로 아래 API를 호출해 가져온다.

```http
GET /images/{imageId}/thumbnail
```

## 앞으로 정리하면 좋은 작업

우선순위 높은 순서다.

1. `/images/buckets`의 의미를 “MinIO 전체 버킷”으로 할지 “catalog 기준 버킷”으로 할지 결정한다.
2. 원본 JSON을 MinIO에 실제로 저장할지 결정한다.
3. 다운로드 파일명을 `imageId`로 유지할지 원본 파일명으로 바꿀지 결정한다.

## 최종 판단

`쿠첸_API설계_v0.2.xlsx`의 큰 API 구조와 실제 백엔드 구현은 대체로 맞다. 특히 엔드포인트 9개, 공통 envelope, 스트리밍 예외, 검색 응답 구조, 메타데이터 단건 조회 구조는 실제 코드와 일치한다.

다만 운영 문서로 쓰려면 세부 표현은 계속 최신화가 필요하다. 현재 남은 주요 차이는 `/images/buckets`의 실제 의미와 원본 JSON 저장 미구현이다.
