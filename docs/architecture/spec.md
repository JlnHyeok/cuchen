# 아키텍처 계약

## 목적
이 문서는 하위 에이전트가 안정적으로 따라야 하는 시스템 경계와 책임 분리를 고정한다.

## 현재 경계
- 백엔드는 NestJS 서비스다.
- MongoDB는 조회 정본 저장소다.
- MinIO는 이미지 원본과 썸네일 저장소다.
- SvelteKit 프론트엔드는 백엔드 HTTP API의 소비자다.
- Electron desktop은 별도 데스크톱 앱이다.

## 현재 책임
- 이미지와 JSON 쌍은 basename으로 매칭한다.
- JSON은 저장 전에 파싱과 정규화를 거친다.
- MongoDB는 metadata와 search result를 저장한다.
- 이미지 바이너리와 원본 JSON, 썸네일은 MinIO에 저장한다.
- `/images/:id/metadata`는 정규화된 record를 반환한다.
- `/images/:id/blob`, `/images/:id/thumbnail`, `/images/:id/download`는 MinIO 경로를 스트리밍한다.

## 현재 객체 모델
```text
images/{imageId}.{ext}
thumbnails/{imageId}.webp
raw-json/{imageId}.json
```

## 현재 HTTP 계약
- `GET /health`
- `GET /images/buckets`
- `POST /ingest/scan`
- `GET /images/search`
- `GET /images/:id/metadata`
- `GET /images/:id`
- `GET /images/:id/blob`
- `GET /images/:id/thumbnail`
- `GET /images/:id/download`
- `GET /images/events`

## 전환 경계
목표 구조는 backend / frontend 분리 배포이지만, 책임 분리는 명확해야 한다.

- MongoDB는 조회 가능한 metadata와 filtered search를 책임진다.
- MinIO는 이미지 blob, 썸네일, 원본 JSON을 책임진다.
- 공개 HTTP 표면은 backend가 유지한다.
- frontend는 backend HTTP API만 사용한다.

## 유지해야 할 규칙
- list/search를 MinIO 객체 순회로 처리하지 않는다.
- 이미지 바이트를 MongoDB로 옮기지 않는다.
- MongoDB metadata 정본을 둘로 만들지 않는다.
- MinIO S3 API endpoint와 console endpoint를 혼동하지 않는다.

## 변경 순서
경계가 바뀌면 순서는 항상 다음과 같다.
1. 이 계약 문서를 먼저 고친다.
2. backend/frontend/integration 문서를 맞춘다.
3. 구현은 마지막에 바꾼다.
