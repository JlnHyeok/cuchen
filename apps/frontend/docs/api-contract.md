# API Contract v1

## 공통
- v1 프론트는 백엔드 HTTP API를 호출하되, 화면 내부 TypeScript shape는 아래 `FileListItem` 계열로 유지한다.
- 실제 Backend HTTP 경로는 `/images` 계열을 기준으로 한다.
- JSON 응답은 백엔드 공통 envelope `{ success, message, data, errorCode, errorMessage }`로 감싸진다.
- 스트리밍 응답(`/images/:imageId/blob`, `/images/:imageId/download`)은 envelope 없이 binary를 반환한다.
- 날짜 필터는 metadata의 `time`을 기준으로 하며 `YYYY-MM-DD` 형식이다.
- `dateFrom` / `dateTo`는 포함 범위다.
- `productId` / `div` / `result`는 정확히 일치하는 값으로 필터링한다.
- 페이지는 1부터 시작한다.
- 백엔드는 이미지 단위 레코드를 반환하고, 프론트 API 어댑터가 `productId` 기준 대표 행으로 병합한다.

## Metadata
| 항목명 | 타입 | 설명 | 비고 |
|---|---:|---|---|
| `product_id` | string | 제품번호 |  |
| `div` | string | 이미지 구분 | `top`, `bot`, `top-inf`, `bot-inf` |
| `time` | string | 촬영 일시 | ISO 8601 |
| `result` | string | 검사 결과 | `OK`, `NG` |
| `threshold` | float | 판정 임계 값 |  |
| `prob` | float | 예측 확률 | 0~1 사이의 값 |

`div` 값:
- `top`: 상단 원본 이미지
- `bot`: 하단 원본 이미지
- `top-inf`: 상단 결과 이미지
- `bot-inf`: 하단 결과 이미지

## Types
```ts
type ImageDiv = 'top' | 'bot' | 'top-inf' | 'bot-inf';
type InspectionResult = 'OK' | 'NG';

interface FileListQuery {
  page: number;
  pageSize: number;
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
  div?: ImageDiv;
  result?: InspectionResult;
}

interface FileListItem {
  id: string;
  fileName: string;
  productId: string;
  div: ImageDiv;
  divs?: ImageDiv[];
  fileCount?: number;
  time: string;
  result: InspectionResult;
  threshold: number;
  prob: number;
  sizeBytes: number;
}

interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

interface FilterOptions {
  productIds: string[];
  divs: ImageDiv[];
  results: InspectionResult[];
}
```

## API 함수
- `listFiles(query): Promise<PageResult<FileListItem>>`
- `getFilterOptions(): Promise<FilterOptions>`
- `getImageBlob(fileId): Promise<Blob>`
- `getProductFiles(fileId): Promise<FileListItem[]>`
- `downloadFile(fileId): Promise<{ blob: Blob; fileName: string }>`
- `downloadFiles(fileIds): Promise<{ blob: Blob; fileName: string }>`

## Backend HTTP 계약
- `GET /images/search`
- `GET /images/:imageId/metadata`
- `GET /images/:imageId/blob`
- `GET /images/:imageId/download`

### GET `/images/search`
백엔드는 기본적으로 이미지 단위 `CatalogRecord`를 반환한다. 목록 화면은 제품 단위 row가 필요하므로 `productPage=1`을 함께 보내고, 백엔드가 제품 기준으로 페이지네이션한 이미지 묶음을 한 번에 반환한다.

Query:
- `page`: number, 기본값 `1`
- `pageSize`: number, 기본값 `20`, 백엔드 최대값 `1000`
- `productPage`: `1 | true`, 선택. 제품 기준 페이지네이션을 사용한다.
- `capturedAtFrom`: ISO datetime, 선택
- `capturedAtTo`: ISO datetime, 선택
- `productNo`: string, 선택. 백엔드는 `productNo`, `product_id`, `productId`를 함께 검색한다.
- `processCode`: `top | bot | top-inf | bot-inf`, 선택. 백엔드는 `processCode`, `process_code`, `div`를 함께 검색한다.
- `result`: `OK | NG`, 선택
- `lotNo`: string, 선택
- `processId`: string, 선택
- `version`: string, 선택

Envelope `data`:
```json
{
  "items": [
    {
      "imageId": "file-0001",
      "bucket": "jin-test",
      "fileName": "CUCHEN-00001-top",
      "fileExt": "png",
      "metadata": {
        "product_id": "CUCHEN-00001",
        "div": "top",
        "time": "2026-04-21T09:00:00.000Z",
        "result": "OK",
        "threshold": 0.7,
        "prob": 0.88,
        "size": 420000
      }
    }
  ],
  "page": 1,
  "pageSize": 100,
  "total": 72,
  "totalData": 288
}
```

### GET `/images/:imageId/metadata`
선택한 이미지의 `CatalogRecord`를 envelope로 반환한다. 상세 모달과 제품 묶음 다운로드는 이 레코드의 `productId`를 기준으로 `/images/search`를 다시 호출해 같은 제품 이미지를 찾는다.

### GET `/images/:imageId/blob`
선택한 이미지 원본을 binary로 반환한다. 상세 모달 미리보기에서 사용한다.

### GET `/images/:imageId/download`
선택한 이미지 원본을 다운로드용 binary로 반환한다. 프론트 다운로드는 이미지와 같은 basename의 metadata JSON을 함께 전달해야 하므로, 제품 묶음 ZIP과 선택 ZIP은 프론트에서 여러 이미지 blob과 `/images/:imageId/metadata` 응답의 `metadata`를 받아 `fflate`로 생성한다.

## MongoDB paging 기준
- 정렬은 `updatedAt desc, imageId asc`를 사용한다.
- `skip = (page - 1) * pageSize`, `limit = pageSize`를 사용한다.
- 기간/제품번호/이미지구분/검사결과/LOT/공정 ID는 MongoDB query 조건으로 처리한다.
- 목록 화면은 `productPage=1`을 사용해 MongoDB에서 `productId`로 그룹핑한 뒤 대표 row 단위로 페이지네이션한다.
- `productPage=1`일 때 `total`은 총 제품 수, `totalData`는 조건에 맞는 총 이미지 수다.
- 응답 shape는 더미 API와 동일하게 유지한다.

## 비범위
- 업로드
- 수정
- 인증
