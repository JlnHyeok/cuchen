# Docker Infra Workspace

이 폴더는 Docker 기반 배포 파일을 둔다.

## 포함 파일
- `docker-compose.yml`
- `backend.Dockerfile`
- `.env.example`
- `bootstrap.sh`

## 구성
- backend
- MongoDB
- MinIO

## 실행
- `cp infra/docker/.env.example infra/docker/.env`
- `chmod +x infra/docker/bootstrap.sh`
- `infra/docker/bootstrap.sh`

## 실행 순서
- `docker compose --env-file .env up -d`
- backend와 desktop은 Docker가 아니라 각자 `apps/backend`, `apps/desktop`에서 실행한다.

## 언제 쓰는가
- 이 폴더는 MongoDB / MinIO를 로컬에 직접 올리고 싶을 때만 사용한다.
- 이미 원격 MongoDB / MinIO가 준비돼 있으면 이 폴더를 실행하지 않아도 된다.
- 현재 원격 연결 기준은 `apps/backend/.env`에서 관리한다.

## 메모
- backend는 `infra/docker/.env`의 환경변수를 읽는다.
- backend의 로컬 개발 환경은 `apps/backend/.env`를 사용한다.
- desktop(Electron)은 로컬 앱으로 남겨도 된다.
- 불필요한 reverse proxy나 init service는 넣지 않는다.
