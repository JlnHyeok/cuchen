# Review Guide

## 공통 리뷰 관점
- 명세와 구현이 일치하는가
- 데이터 흐름이 SvelteKit frontend -> backend HTTP -> MongoDB/MinIO 경계를 지키는가
- 실패 시 복구 가능성이 있는가
- 대량 데이터에서 MongoDB와 MinIO 중 어느 쪽이 병목인지 분리해서 볼 수 있는가
- 책임이 백엔드와 SvelteKit 프론트엔드 사이에서 섞이지 않는가

## 우선순위
1. 데이터 정합성
2. 조회 성능
3. 실패 복구
4. UX 신뢰성
5. 코드 구조

## 리뷰 산출물
리뷰는 항상 아래 네 항목을 포함한다.
- 발견한 문제
- 영향 범위
- 재현 또는 근거
- 수정 제안

## 관측 포인트
- ingest 처리시간
- MongoDB upsert 시간
- MinIO put/head/get 시간
- 조회 p50/p95
- 이미지 조회 latency
- 에러율
- frontend API 요청 실패율
- 빈 상태와 로딩 상태의 명확성

## 현재 E2E 경로
- SvelteKit 프론트엔드는 backend HTTP API를 호출한다.
- backend는 MongoDB와 MinIO를 각각의 정본으로 사용한다.
- 따라서 backend 장애, MongoDB 장애, MinIO 장애, frontend API 요청 실패를 분리해서 봐야 한다.

## MongoDB 도입 후 확인
- 목록은 MongoDB 기준이고 이미지는 MinIO 기준이라는 분리가 유지되는가
- MongoDB 성공 / MinIO 실패, MinIO 성공 / MongoDB 실패를 각각 재현할 수 있는가
- partial write가 로그, 메트릭, 재시도 큐 중 하나 이상에 남는가
- SvelteKit 프론트엔드가 partial state를 정상 데이터로 오인하지 않는가
