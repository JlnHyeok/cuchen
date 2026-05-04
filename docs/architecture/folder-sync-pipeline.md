# API 기반 파일 동기화 파이프라인

이 문서는 에이전트가 생성한 이미지/JSON 파일 묶음을 backend API 호출로 MongoDB와 MinIO에 동기화하는 흐름을 정의한다. 현재 활성 흐름은 폴더 상시 감시가 아니다.

## 1. 목표
- 에이전트가 파일 생성 완료 후 `path`와 `filebase`를 backend에 명시적으로 전달한다.
- backend는 전달받은 파일 묶음만 읽고 MongoDB와 MinIO에 저장한다.
- 성공한 입력 파일은 삭제한다.
- 실패한 pair는 입력 폴더 아래 `failed/`로 이동한다.
- 일부 필수 파일이 없으면 `400 Bad Request`로 거절하고 ingest를 시작하지 않는다.

## 2. 입력 규칙
- API: `POST /ingest/files`
- 요청 바디:

```json
{
  "path": "/c/files/inbox",
  "filebase": "cuchen-test"
}
```

backend는 아래 4개 div를 고정으로 처리한다.

- `top`
- `bot`
- `top-inf`
- `bot-inf`

따라서 위 요청은 아래 8개 파일을 요구한다.

```text
/c/files/inbox/cuchen-test-top.png
/c/files/inbox/cuchen-test-top.json
/c/files/inbox/cuchen-test-bot.png
/c/files/inbox/cuchen-test-bot.json
/c/files/inbox/cuchen-test-top-inf.png
/c/files/inbox/cuchen-test-top-inf.json
/c/files/inbox/cuchen-test-bot-inf.png
/c/files/inbox/cuchen-test-bot-inf.json
```

이미지 확장자는 기존 ingest 구현과 같이 `.png`, `.jpg`, `.jpeg`를 허용한다. 호출자가 기대하는 기본 형태는 `.png`다.

## 3. 이벤트 흐름
1. 에이전트가 입력 폴더에 4개 div의 이미지/JSON 쌍을 생성한다.
2. 에이전트가 `POST /ingest/files`에 `path`와 `filebase`를 전달한다.
3. backend가 4개 div pair의 존재 여부를 먼저 검증한다.
4. 하나라도 없으면 `400 Bad Request`를 반환하고 파일을 이동하거나 저장하지 않는다.
5. 모두 있으면 각 pair를 JSON 파싱, metadata 정규화, MongoDB upsert, MinIO 이미지/썸네일 저장 순서로 처리한다.
6. 성공한 pair의 원본 이미지와 JSON은 삭제한다.
7. 실패한 pair의 원본 이미지와 JSON은 `failed/` 폴더로 이동한다.

## 4. 저장 규칙

### MongoDB
- 목록, 검색, 상세 metadata, ingest 상태의 정본이다.
- 같은 `productId + div`는 같은 `imageId`로 upsert된다.

### MinIO
- 이미지 원본과 썸네일의 정본이다.
- 저장 키:
  - `images/{imageId}.{ext}`
  - `thumbnails/{imageId}.webp`

## 5. 실패 처리
- 필수 파일 누락: `400 Bad Request`, ingest 시작 안 함, 파일 이동 안 함.
- JSON 파싱 실패 또는 저장 실패: 해당 pair를 `failed/`로 이동하고 outcome의 `failed`를 증가시킨다.
- 일부 pair 실패 시 다른 pair는 독립적으로 처리될 수 있다.

## 6. 운영 관측 포인트
- `POST /ingest/files` 호출 수
- 요청별 `processed`, `synced`, `failed`, `partial` 수
- MongoDB upsert 지연
- MinIO put 지연
- `failed/` 폴더 누적 파일 수
