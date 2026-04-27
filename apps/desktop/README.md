# Desktop Workspace

이 폴더는 새 Electron 앱 구현 전용이다.

## 범위
- 목록 조회 UI
- 필터링과 페이지네이션
- 이미지 보기
- 체크 기반 다운로드 UX

## 실행
- `npm run dev`
  - Electron 셸을 실행한다.
- `BACKEND_URL=http://127.0.0.1:3000 npm run dev`
  - 다른 backend 주소로 붙고 싶을 때 사용한다.
- backend가 MongoDB / MinIO 실연동 모드라면 먼저 `cd ../../infra/docker && docker compose --env-file .env up -d`를 실행한다.
- `npm run test`
  - JS 문법 체크를 실행한다.
- `npm run e2e`
  - 실제 Electron 창을 띄워 backend 연동, 필터링, 미리보기, 저장 동작을 코드로 검증한다.

## 주의
- 기존 Electron 프로토타입은 `legacy/minio-prototype/electron/`에 있다.
- 새 구현은 여기서부터 다시 시작한다.
