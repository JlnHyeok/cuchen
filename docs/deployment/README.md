# 배포 문서 허브

이 폴더는 현재 활성 배포 계약과 보관용 설치 문서를 구분해서 관리한다.

## 활성 계약
- `docs/deployment/spec.md`
- `docs/deployment/plan.md`
- `docs/deployment/review.md`

## 현재 기준
- 백엔드는 Docker로 배포한다.
- 프론트엔드는 SvelteKit 앱으로 별도 배포한다.
- MongoDB와 MinIO는 backend 인프라로 묶는다.
- 프론트는 backend HTTP API만 바라본다.

## 보관 문서
- `docs/deployment/installer.md`
- `docs/deployment/installer-plan.md`
- `docs/deployment/installer-review.md`
