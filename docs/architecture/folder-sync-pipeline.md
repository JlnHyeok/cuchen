# 폴더 감시 동기화 파이프라인

이 문서는 backend가 특정 입력 폴더를 계속 감시하면서 `.png` 또는 `.jpg`와 `.json` 파일 쌍을 자동으로 MongoDB와 MinIO에 동기화하는 흐름을 정의한다.

## 1. 목표
- 입력 폴더에 파일이 추가되면 수동 API 호출 없이 자동으로 동기화를 수행한다.
- 이미지 원본은 MinIO에 저장하고, 조회용 metadata는 MongoDB에 저장한다.
- 같은 basename을 가진 이미지와 JSON을 하나의 작업 단위로 처리한다.
- 재시도와 partial write를 고려한 idempotent 파이프라인으로 설계한다.

## 2. 입력 규칙
- 허용 이미지 확장자:
  - `.png`
  - `.jpg`
  - `.jpeg`
- 설명 파일 확장자:
  - `.json`
- 같은 basename이 하나의 pair가 된다.

예:

```text
sample-000001.png
sample-000001.json
```

또는

```text
sample-000001.jpg
sample-000001.json
```

## 3. 이벤트 흐름
1. backend watcher가 지정된 입력 폴더를 계속 감시한다.
2. 파일 생성 또는 변경 이벤트를 수신한다.
3. 이벤트가 들어오면 basename 기준으로 현재 상태를 pair cache에 반영한다.
4. 이미지와 JSON이 모두 존재하면 `pair ready` 상태로 전이한다.
5. 파일이 아직 복사 중인지 확인하는 안정화 단계를 거친다.
6. 안정화가 끝나면 ingest job을 큐에 넣는다.
7. ingest job은 JSON 정규화 후 MongoDB와 MinIO에 기록한다.
8. 성공 시 pair 상태를 `synced`로 기록한다.
9. 실패 시 pair 상태를 `failed` 또는 `partial`로 기록하고 재시도 대상에 넣는다.

## 4. pair 매칭 규칙
- 같은 basename의 이미지 파일과 JSON 파일을 하나의 ingest pair로 본다.
- basename 충돌을 방지하기 위해 입력 폴더 내 상대경로와 basename을 함께 식별자로 사용할 수 있다.
- 같은 basename으로 `.png`와 `.jpg`가 동시에 존재하면 정책적으로 한 개만 허용한다.
  - 기본 정책:
    - 최신 수정 시각 파일만 유효 처리
    - 다른 확장자는 conflict 상태로 기록
- JSON만 먼저 들어오면 대기 상태를 유지한다.
- 이미지 파일만 먼저 들어오면 대기 상태를 유지한다.

## 5. 파일 완료 판정
- watcher 이벤트 직후 바로 처리하지 않는다.
- 파일 크기와 수정 시각이 일정 시간 동안 변하지 않을 때만 완료로 본다.
- 권장 방식:
  - debounce + 안정화 검사
  - 예: 1~3초 간격으로 2회 확인
- 대용량 파일 복사 중에는 처리하지 않는다.
- 완료 판정 실패 시 다음 검사 주기로 넘긴다.

## 6. ingest 처리 순서
1. pair lock 획득
2. 이미지/JSON 파일 읽기
3. JSON 파싱
4. metadata 정규화
5. `imageId` 생성
6. MinIO object key 계산
7. MongoDB upsert
8. MinIO put
9. 성공 상태 기록
10. lock 해제

## 7. 저장 규칙

### MongoDB
- 정본 역할:
  - 목록
  - 검색
  - 상세 metadata
  - ingest 상태 추적
- 저장 필드 예:
  - `imageId`
  - `fileName`
  - `sourcePath`
  - `bucket`
  - `objectKey`
  - `metadata`
  - `syncStatus`
  - `createdAt`
  - `updatedAt`

### MinIO
- 정본 역할:
  - 이미지 원본
- 저장 키 예:
  - `images/{imageId}.png`
  - `images/{imageId}.jpg`

## 8. idempotency와 재처리
- 같은 pair가 다시 들어와도 중복 생성이 아니라 upsert로 수렴해야 한다.
- `imageId`는 basename만이 아니라 파일 내용 또는 정규화 기준을 포함해 안정적으로 계산한다.
- 같은 파일 재복사 시:
  - 변경이 없으면 no-op
  - JSON 또는 이미지가 바뀌면 update 처리
- ingest는 최소 한 번 이상 실행될 수 있다고 가정하고 설계한다.

## 9. partial write 처리

### MongoDB 성공 / MinIO 실패
- MongoDB 문서는 `partial` 또는 `imagePending` 상태로 남긴다.
- frontend는 이를 정상 데이터처럼 보이지 않게 해야 한다.
- 재시도 큐에서 MinIO 저장만 다시 시도한다.

### MinIO 성공 / MongoDB 실패
- orphan object가 생길 수 있다.
- MongoDB 재시도 또는 orphan cleanup 정책이 필요하다.
- 기본 정책:
  - MongoDB 재시도 우선
  - 일정 시간 후에도 실패하면 cleanup 후보로 기록

## 10. 삭제/수정 정책

### 수정
- 이미지 또는 JSON이 변경되면 같은 pair를 다시 ingest한다.
- 변경된 결과는 MongoDB upsert와 MinIO overwrite 또는 versioned put으로 반영한다.

### 삭제
- 기본 정책은 soft-sync다.
- 입력 폴더에서 삭제되었다고 즉시 MongoDB/MinIO에서 삭제하지 않는다.
- 대신 다음 상태 중 하나로 관리한다.
  - `missing-source`
  - `deleted-at-source`
- 실제 삭제는 별도 운영 정책과 승인 흐름이 있어야 한다.

## 11. watcher 방식 권장안

### 기본 권장
- `chokidar` 같은 안정적인 파일 감시 라이브러리 사용
- 이유:
  - `fs.watch` 단독보다 플랫폼 간 동작이 예측 가능함
  - debounce, add/change 이벤트 처리 경험이 더 많음

### 보조 전략
- watcher만 믿지 않고 주기적 reconciliation scan을 함께 둔다.
- 이유:
  - 누락 이벤트 보정
  - 재시작 후 복구
  - 대량 파일 유입 시 정합성 확보

### 권장 조합
- 실시간 watcher
- 주기적 scan worker
- pair 상태 저장소

## 12. 운영 관측 포인트
- watcher event 수
- pair ready 수
- 안정화 대기 시간
- ingest 성공/실패 수
- partial write 수
- 재시도 횟수
- MongoDB upsert 지연
- MinIO put/get 지연
- orphan object 수
- source missing 상태 수

## 13. 구현 우선순위
1. 수동 scan ingest
2. watcher + 안정화
3. pair 상태 저장
4. 재시도 큐
5. reconciliation scan
6. 삭제/수정 정책 고도화
