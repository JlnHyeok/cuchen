# 백엔드 문서 허브

이 폴더는 NestJS 백엔드의 계약과 구현 기준을 모아 둔 곳이다.

## 읽기 순서
1. `docs/backend/spec.md`
2. `docs/backend/plan.md`
3. `docs/backend/implementation.md`
4. `docs/backend/review.md`
5. `docs/backend/api-spec.md`

## 핵심 연결 관계
- 프론트는 백엔드 HTTP API만 사용한다.
- 백엔드는 MongoDB를 조회 정본으로, MinIO를 이미지 정본으로 사용한다.
- 배포는 `backend / frontend 분리 배포`를 기본으로 한다.

## 산출물
- `docs/backend/api-spec.md`
- `docs/backend/implementation.md`
- `docs/backend/쿠첸_API설계_v0.2.xlsx`
- `docs/backend/쿠첸_테이블정의서_v0.1.xlsx`
