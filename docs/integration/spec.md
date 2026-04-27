# Integration and E2E Spec

## 목적
백엔드와 SvelteKit 프론트엔드가 실제로 어떤 경로로 연결되는지, 그리고 MongoDB/MinIO가 들어왔을 때 어떤 E2E 검증이 필요한지 고정한다.

## 현재 네트워크 맵
- SvelteKit 프론트엔드는 backend HTTP API를 호출한다.
- 프론트엔드는 MongoDB와 MinIO에 직접 접근하지 않는다.
- backend는 `NestJS -> MongoDB / MinIO` 경로로 동작한다.

## 대상 시나리오
- 폴더에 파일 쌍 추가 후 ingest
- backend `/health` 응답 확인
- MongoDB 저장 확인
- MinIO 이미지/썸네일 저장 확인
- SvelteKit 버킷 조회
- SvelteKit 목록 조회
- SvelteKit 필터링
- SvelteKit 상세 패널 조회
- SvelteKit 이미지 보기와 다운로드

## 필수 검증
- 목록이 MongoDB query를 읽는지 명확한가
- 필터 변경 후 결과가 즉시 바뀌는가
- 삭제된 버킷이나 오래된 캐시가 UI에 남지 않는가
- 상세 패널이 MongoDB record를 읽고 있는지 설명 가능한가
- 이미지 보기와 다운로드가 backend의 blob/thumbnail/download 경로를 탄다는 점이 명확한가

## 실패 처리
- backend 기동 실패
- MongoDB 성공 / MinIO 실패
- MongoDB 실패 / MinIO 성공
- JSON 파싱 실패
- 중복 파일 처리
- record가 없고 raw-json만 있는 경우
- MongoDB 문서는 있는데 MinIO blob이 없는 경우

## 관측 항목
- backend 기동 시간과 실패 원인
- ingest scan / JSON parse / MongoDB upsert / MinIO put / thumbnail 생성 latency
- frontend API 요청 실패율
- 목록 첫 응답 시간
- 상세 패널 응답 시간
- 이미지 조회 시간
- partial write 또는 retry 대상 건수

## MongoDB + MinIO 추가 검증
- 같은 `imageId`가 MongoDB 문서와 MinIO object key에 동시에 존재하는가
- 재ingest가 MongoDB upsert와 MinIO idempotency로 수렴하는가
- MongoDB 성공 / MinIO 실패 시 partial write가 로그와 메트릭에 남는가
- MinIO 성공 / MongoDB 실패 시 SvelteKit 목록에서 완료 데이터로 보이지 않는가
- SvelteKit 프론트엔드가 목록은 MongoDB, 이미지는 MinIO라는 계약을 끝까지 지키는가
