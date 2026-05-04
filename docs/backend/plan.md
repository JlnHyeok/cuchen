# 백엔드 계획

## 1. 공개 API 정리
- `/health`
- `/images/buckets`
- `/ingest/files`
- `/ingest/scan`
- `/images/search`
- `/images/:imageId`
- `/images/:imageId/metadata`
- `/images/:imageId/blob`
- `/images/:imageId/thumbnail`
- `/images/:imageId/download`

## 2. 저장소 경계
- MongoDB는 조회 정본만 저장한다.
- MinIO는 이미지 원본과 썸네일을 저장한다.
- 원본 JSON은 `rawJsonKey` 예약 경로만 기록되어 있으므로, 실제 객체 저장 여부는 별도 구현 판단이 필요하다.
- manifest 기반 search는 제거하고 MongoDB query로 이동한다.

## 3. ingest 파이프라인
- `path + filebase` 기반 4개 div pair matching
- 필수 파일 누락 시 Bad Request
- metadata 정규화
- `imageId` 생성
- MongoDB upsert
- MinIO 원본 저장
- MinIO 썸네일 저장
- 성공한 입력 파일 삭제
- 실패한 pair를 `failed/`로 이동
- partial write 상태 기록

## 4. query 경로
- bucket 목록 조회
- pagination과 filter query
- 단건 metadata lookup
- image blob / thumbnail / download streaming

## 5. 테스트
- route coverage
- ingest coverage
- MongoDB/MinIO 연결 coverage
- search/filter coverage
- partial failure coverage
