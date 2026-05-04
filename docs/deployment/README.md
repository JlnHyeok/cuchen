# 배포 문서 허브

이 폴더는 현재 활성 배포 계약과 보관용 설치 문서를 구분해서 관리한다.

## 활성 계약
- `docs/deployment/spec.md`
- `docs/deployment/plan.md`
- `docs/deployment/review.md`
- `docs/deployment/no-docker-install.md`

## 현재 기준
- Version A는 host/WSL 직접 실행이다.
- Version B는 추후 Docker 실행 가능형이다.
- 현재 기본 기준은 Version A다.
- 프론트엔드는 SvelteKit 앱으로 별도 배포한다.
- MongoDB와 MinIO는 Version A에서는 Docker 없이 로컬/WSL 서비스로 실행하고, Version B에서는 Docker 스택으로 묶을 수 있다.
- 프론트는 backend HTTP API만 바라본다.
- Docker 미사용 설치/배포 절차는 `docs/deployment/no-docker-install.md`를 기준으로 한다.

## 보관 문서
- `docs/deployment/installer.md`
- `docs/deployment/installer-plan.md`
- `docs/deployment/installer-review.md`
