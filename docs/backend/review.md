# 백엔드 리뷰 관점

구현 세부 설명과 `쿠첸_API설계_v0.2.xlsx` 정합성 검토 결과는 `docs/backend/implementation.md`를 기준으로 본다.

## 기능 리뷰
- basename으로 짝지어진 파일만 함께 처리되는지 본다.
- JSON 정규화가 현재 metadata contract와 맞는지 본다.
- ingest 경로가 MongoDB upsert와 MinIO 저장을 일관되게 기록하는지 본다.
- 중복 re-ingest가 MongoDB와 MinIO 경로를 깨지 않는지 본다.

## 경계 리뷰
- MongoDB가 조회 정본 역할을 실제로 수행하는지 본다.
- MinIO가 이미지 원본과 썸네일 저장소로 유지되는지 본다.
- backend HTTP API가 frontend 계약과 어긋나지 않는지 본다.

## 성능 리뷰
- search가 MinIO 객체를 직접 순회하지 않는지 본다.
- image streaming과 thumbnail streaming이 분리되어 있는지 본다.
- 현재 데이터 규모에서 MongoDB query가 병목인지 본다.

## 안정성 리뷰
- partial ingest failure가 명확하게 보고되는지 본다.
- `memory` storage mode가 테스트 전용으로 격리되는지 본다.
- MongoDB failure와 MinIO failure가 호출자에게 명확히 전달되는지 본다.

## 2026-04-24 API 설계서 정합성 리뷰
- 엔드포인트 9개는 설계서와 실제 코드가 모두 일치한다.
- JSON 응답 envelope와 스트리밍 API 예외도 실제 구현과 일치한다.
- `/images/buckets`는 MinIO 전체 버킷 조회가 아니라 설정 기본 버킷과 catalog 기준 버킷을 반환하므로 설명 보완이 필요하다.
- `POST /ingest/scan`의 `processed`는 파일 수가 아니라 이미지/JSON pair 수다.
- `result` 필터는 정확 일치라기보다 `OK/PASS`, `NG/FAIL/FAILED` alias 매칭으로 동작한다.
- `lotNo`, `cameraId`는 통합 검색과 별도 query parameter 필터를 모두 지원한다.
- `rawJsonKey`는 생성되지만 원본 JSON을 MinIO에 업로드하는 저장 메서드는 아직 없다.
