# MinIO Image API

MinIO에 이미지와 메타데이터를 적재하고 조회하는 JS 기반 API입니다.  
핵심 서버는 `Node 24 built-ins` 위주로 작성했고, Electron 뷰어는 개발 의존성으로 추가했습니다.

프로젝트 경로:

```bash
/Users/jinhyeokheo/Roylabs/Project/cuchen
```

프로젝트 구조:

```text
docs/              프로젝트 문서
electron/          Electron 뷰어
src/               API 서버 코드
scripts/bench/     벤치마크 및 비교 스크립트
scripts/dev/       개발 확인용 스크립트
scripts/ops/       버킷 정리 및 재적재 스크립트
generated/fixtures 생성 fixture
artifacts/reports  보고서와 측정 결과
tests/             자동 테스트
```

## 1. 기능 요약

- 로컬 폴더의 `a.png + a.json` 쌍을 읽어 MinIO에 업로드
- 원본 JSON의 일반 필드에서 `meta`, `tag`를 추출해 정규화 레코드 저장
- 검색용 `manifest`를 MinIO에 저장하고 서버 메모리에 캐시
- 이미지 단건 조회
- 메타데이터 단건 조회
- `productNo`, `capturedAt`, `aiResult`, `threshold` 기준 검색
- 더미 fixture 이미지/JSON 생성
- Electron 파일 뷰어
- smoke test, benchmark 실행

## 2. 저장 구조

MinIO 버킷 안에는 아래 구조로 저장됩니다.

```text
images/{id}.png
raw-json/{id}.json
records/{id}.json
manifests/catalog.json
```

설명:

- `images/`: 실제 PNG 이미지
- `raw-json/`: 원본 JSON
- `records/`: 정규화된 메타데이터 레코드
- `manifests/catalog.json`: 검색용 캐시 데이터

## 3. 환경 설정

`.env` 파일 예시:

```env
APP_PORT=3000
STORAGE_MODE=minio
MINIO_ENDPOINT=http://192.168.1.92:9000
MINIO_ACCESS_KEY=YOUR_ACCESS_KEY
MINIO_SECRET_KEY=YOUR_SECRET_KEY
MINIO_BUCKET=jin-test
DEFAULT_FIXTURE_DIR=./generated/fixtures
BENCHMARK_REPORT_DIR=./artifacts/reports
```

주요 값:

- `APP_PORT`: API 서버 포트
- `STORAGE_MODE=minio`: 실제 MinIO 사용
- `STORAGE_MODE=memory`: 메모리 저장소로 테스트
- `MINIO_ENDPOINT`: MinIO S3 API 주소
- `MINIO_BUCKET`: 업로드 대상 버킷
- `DEFAULT_FIXTURE_DIR`: fixture 생성 기본 경로
- `BENCHMARK_REPORT_DIR`: 벤치마크 결과 저장 경로

주의:

- `192.168.1.92:9001`은 MinIO 콘솔입니다.
- 실제 앱 업로드/조회는 `192.168.1.92:9000`으로 연결합니다.

## 4. 실행 방법

백엔드만 별도로 실행하려면:

```bash
node src/server.js
```

Electron 뷰어는 백엔드를 포함해서 실행합니다:

```bash
npm run electron
```

백엔드 단독 실행 후 기본 주소:

```text
http://127.0.0.1:3000
```

상태 확인:

```bash
curl http://127.0.0.1:3000/health
```

## 5. API 사용법

### 5.1 fixture 생성

예시:

```bash
curl -X POST http://127.0.0.1:3000/fixtures/generate \
  -H "Content-Type: application/json" \
  -d '{
    "count": 3,
    "outputDir": "./generated/fixtures/manual",
    "startIndex": 1
  }'
```

생성 결과:

- `./generated/fixtures/manual/sample-000001.png`
- `./generated/fixtures/manual/sample-000001.json`
- ...

### 5.2 폴더 ingest

예시:

```bash
curl -X POST http://127.0.0.1:3000/ingest/scan \
  -H "Content-Type: application/json" \
  -d '{
    "inputDir": "./generated/fixtures/manual"
  }'
```

응답 필드:

- `processed`: `.png + .json` 쌍으로 처리한 개수
- `uploaded`: 신규 업로드 개수
- `updated`: 기존 ID 재업로드 개수
- `skipped`: 짝이 맞지 않아 건너뛴 개수
- `failed`: 파싱/업로드 실패 개수

원본 JSON은 `meta`, `tag` 구조일 필요가 없습니다. 예를 들면 아래처럼 일반 JSON이면 됩니다.

```json
{
  "productNo": "PRD-100001",
  "capturedAt": "2026-01-01T00:00:00.000Z",
  "lotNo": "LOT-001",
  "cameraId": "CAM-01",
  "aiResult": "FAIL",
  "threshold": 0.42,
  "inspectorModel": "vision-v1",
  "inspectedAt": "2026-01-01T00:00:03.000Z"
}
```

이때 서버는 다음처럼 분리해서 저장합니다.

- `meta`: `productNo`, `capturedAt`, `lotNo`, `cameraId` 같은 정적 정보
- `tag`: `aiResult`, `threshold`, `inspectorModel`, `inspectedAt` 같은 판정/검사 정보

기본 추출 키:

- `meta.productNo`: `productNo`, `productNumber`, `sku`, `제품번호`, `품번`
- `meta.capturedAt`: `capturedAt`, `captured_at`, `shotAt`, `shot_at`, `촬영일시`, `촬영시간`
- `tag.aiResult`: `aiResult`, `inspectionResult`, `result`, `판정결과`, `ai판정결과`, `검사결과`
- `tag.threshold`: `threshold`, `inspectionThreshold`, `임계치`, `검사시임계치`, `검사임계치`

### 5.3 이미지 단건 조회

```bash
curl http://127.0.0.1:3000/images/<id> --output image.png
```

### 5.4 메타데이터 단건 조회

```bash
curl http://127.0.0.1:3000/images/<id>/metadata
```

### 5.5 검색

기본 검색:

```bash
curl "http://127.0.0.1:3000/images/search?page=1&pageSize=20"
```

제품번호 검색:

```bash
curl "http://127.0.0.1:3000/images/search?productNo=PRD-100001&page=1&pageSize=20"
```

AI 결과 + threshold 검색:

```bash
curl "http://127.0.0.1:3000/images/search?aiResult=FAIL&thresholdMin=0.1&thresholdMax=0.5&page=1&pageSize=20"
```

날짜 범위 검색:

```bash
curl "http://127.0.0.1:3000/images/search?capturedAtFrom=2026-01-01T00:00:00.000Z&capturedAtTo=2026-01-01T12:00:00.000Z&page=1&pageSize=20"
```

지원 쿼리:

- `productNo`
- `capturedAtFrom`
- `capturedAtTo`
- `aiResult`
- `thresholdMin`
- `thresholdMax`
- `page`
- `pageSize`

## 6. Electron 뷰어

업로드된 이미지를 폴더 목록처럼 탐색하는 Electron 뷰어를 함께 제공합니다.

실행 전제:

- `npm run electron` 실행 시 내부 백엔드가 같이 시작됩니다.
- 기본적으로 내부 백엔드 주소를 바라봅니다.
- 다른 주소를 쓰려면 `.env`의 `VIEWER_API_BASE_URL`로 바꿀 수 있습니다.

실행:

```bash
npm run electron
```

화면 구성:

- 좌측 `Files` 영역에 MinIO 버킷 목록을 세로로 표시
- 우측은 `File / Metadata / Tags` 3열 탐색 구조
- `File` 열: 파일명 중심 목록
- `Metadata` 열: 선택한 파일의 메타데이터 목록
- `Tags` 열: 선택한 파일의 태그 목록

뷰어는 다음 API를 사용합니다.

- `GET /` 기반 버킷 목록 조회
- `manifests/catalog.json` 기반 파일 목록 조회
- `records/{id}.json` 기반 상세 데이터 조회
- manifest가 없는 버킷은 `images/` prefix를 직접 읽는 native fallback 사용

참고:

- 기존 `GET /images/search`, `GET /images/:id/metadata`, `GET /images/:id`는 백엔드 호환용으로 남아 있습니다.

## 7. fixture 파일 위치

이제 fixture는 임시 디렉터리가 아니라 워크스페이스 아래 고정 경로에 생성됩니다.

예시:

- `generated/fixtures/smoke`
- `generated/fixtures/benchmark-1000`
- `generated/fixtures/benchmark-10000`
- 직접 지정한 `generated/fixtures/manual`

## 8. Smoke Test

실제 MinIO 기준 smoke test:

```bash
npm run smoke
```

메모리 저장소 기준 smoke test:

```bash
STORAGE_MODE=memory npm run smoke
```

이 스크립트는 다음을 수행합니다.

1. `generated/fixtures/smoke` 폴더 초기화
2. fixture 3개 생성
3. MinIO 업로드
4. 검색
5. 메타데이터 조회
6. 이미지 조회

## 9. Benchmark

실제 MinIO 기준:

```bash
npm run benchmark -- 1000
npm run benchmark -- 10000
```

저장 방식 비교:

```bash
npm run compare -- 1000
npm run compare -- 10000
```

메모리 저장소 기준:

```bash
STORAGE_MODE=memory npm run benchmark -- 10000
```

벤치마크는 다음을 측정합니다.

- manifest 로드 시간
- fixture 생성 시간
- ingest 시간
- 이미지 단건 조회 p50 / p95
- productNo 검색 p50 / p95
- 복합 검색 p50 / p95
- `record-json` vs `native metadata/tags` 비교 시:
  - `record-json`: 설명 전체를 한 번에 조회
  - `native metadata/tags`: metadata와 tags를 각각 읽어야 함

결과 파일:

```text
artifacts/reports/benchmark-1000.json
artifacts/reports/benchmark-10000.json
artifacts/reports/storage-compare-1000.json
artifacts/reports/storage-compare-10000.json
```

## 10. 테스트

자동 테스트 실행:

```bash
node --test
```

포함 내용:

- PNG fixture 생성 테스트
- JSON 정규화 테스트
- 폴더 스캔 테스트
- ingest 테스트
- 검색 필터 테스트
- HTTP API 통합 테스트

## 11. 자주 쓰는 운영 작업

### 버킷 비우기

버킷은 유지하고 내부 데이터만 지우려면 현재 코드 기준으로 별도 스크립트가 없으므로, 필요한 경우 동일한 방식으로 S3 API를 호출해 삭제해야 합니다.

### 버킷 변경

`.env`에서 아래 값만 바꾸면 됩니다.

```env
MINIO_BUCKET=jin-test
```

### 메모리 모드 전환

```env
STORAGE_MODE=memory
```

그러면 MinIO 없이 API 흐름만 검증할 수 있습니다.

## 11. 현재 주의사항

- 이 구현은 단일 writer 기준입니다.
- 여러 인스턴스가 동시에 같은 manifest를 갱신하는 구조는 아직 아닙니다.
- 검색 성능은 `manifests/catalog.json`을 메모리에 올리는 전제를 사용합니다.
- MinIO 자격증명이나 버킷 권한이 없으면 업로드/조회는 실패합니다.

## 12. 빠른 시작 예시

```bash
node src/server.js
```

별도 터미널:

```bash
curl -X POST http://127.0.0.1:3000/fixtures/generate \
  -H "Content-Type: application/json" \
  -d '{"count":3,"outputDir":"./generated/fixtures/manual"}'
```

```bash
curl -X POST http://127.0.0.1:3000/ingest/scan \
  -H "Content-Type: application/json" \
  -d '{"inputDir":"./generated/fixtures/manual"}'
```

```bash
curl "http://127.0.0.1:3000/images/search?page=1&pageSize=10"
```
