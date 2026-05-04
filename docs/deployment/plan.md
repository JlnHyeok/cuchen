# 배포 계획

## 1단계. 두 실행 버전 정책 고정
- backend와 frontend를 독립 산출물로 둔다.
- Version A는 host/WSL 직접 실행으로 고정한다.
- Version B는 추후 Docker 실행 가능형으로 분리해 둔다.
- 비활성 배포 형태는 보관용으로만 유지한다.

## 2단계. Version A 실행 환경 구성
- backend는 host/WSL Node.js 프로세스로 실행한다.
- MongoDB와 MinIO는 Docker 없이 로컬/WSL 서비스로 실행한다.
- backend가 외부 HTTP 요청을 안정적으로 받을 수 있게 health check를 둔다.
- `POST /ingest/files`의 `path`는 backend 프로세스가 직접 접근 가능한 OS 경로로 정의한다.
- Ubuntu와 Windows 설치/배포 절차는 `docs/deployment/no-docker-install.md`에 둔다.

## 3단계. Version B Docker 실행형 보조 구성
- backend, MongoDB, MinIO를 Docker Compose 또는 동등한 Docker 스택으로 묶을 수 있게 별도 구성한다.
- `POST /ingest/files`의 `path`가 컨테이너 내부 경로라는 점을 문서화한다.
- host/WSL 파일 경로가 필요하면 bind mount 정책을 명시한다.
- backend가 외부 HTTP 요청을 안정적으로 받을 수 있게 health check를 둔다.

## 4단계. frontend 배포 산출물 정의
- SvelteKit 앱을 backend와 분리된 배포 산출물로 정의한다.
- frontend는 backend URL만 받아 실행할 수 있어야 한다.
- 프론트 패키징과 backend 스택은 서로 독립적으로 릴리스 가능해야 한다.

## 5단계. 환경 설정 정의
- backend URL
- MongoDB 연결 문자열
- MinIO 엔드포인트와 자격 정보
- frontend가 참조할 backend endpoint
- Version A의 host/WSL 경로 기준
- Version B의 Docker bind mount 기준

## 6단계. 릴리스 검증
- backend 단독 기동 확인
- frontend 단독 기동 후 backend 연결 확인
- 목록/검색/페이지네이션 확인
- 이미지 보기와 다운로드 확인
- MinIO bucket 존재 확인
- MongoDB ping 확인
- Version A에서 `/mnt/c/...` 같은 실제 경로 ingest 확인
- Version B에서 bind mount된 컨테이너 경로 ingest 확인
