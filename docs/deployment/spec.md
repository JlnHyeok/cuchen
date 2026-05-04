# 배포 명세

## 목적
이 문서는 이 프로젝트의 실행/배포 방식을 두 가지 버전으로 고정하고, 각 런타임의 책임과 연결 경계를 명확히 한다.

## 기본 원칙
- 기본 실행형은 host/WSL 직접 실행이다.
- Docker 실행형은 추후 배포 가능성을 위한 보조 버전이다.
- 프론트엔드는 SvelteKit 앱으로 별도 실행/배포한다.
- MongoDB와 MinIO는 백엔드가 사용하는 인프라로 관리하되, 기본형에서는 Docker 없이 로컬 서비스로 실행한다.
- 프론트엔드는 백엔드 HTTP API만 호출한다.
- 배포 방식이 달라도 데이터 계약과 API 계약은 바뀌지 않는다.

## 실행/배포 버전

### Version A. Host/WSL 직접 실행
- 현재 기본 실행형이다.
- `backend`, `MongoDB`, `MinIO`를 Docker 없이 host 또는 WSL 프로세스로 실행한다.
- 에이전트는 host/WSL 파일 경로를 관리하고, backend API에 `path`와 `filebase`를 전달한다.
- backend는 자기 실행 환경에서 접근 가능한 실제 OS 경로만 읽는다.
- WSL에서는 `/mnt/c/...`, `/mnt/d/...` 같은 경로를 그대로 사용할 수 있다.
- SvelteKit frontend는 backend HTTP 주소를 설정값으로 받는다.

적합한 경우:
- agent가 생성한 실제 파일 경로를 backend가 그대로 읽어야 할 때
- Docker volume mount 없이 외부 드라이브나 Windows 드라이브 경로를 다뤄야 할 때
- 단일 작업 PC 또는 WSL 기반 운영을 우선할 때

### Version B. Docker 실행 가능형
- 추후 배포 가능성을 위한 보조 실행형이다.
- `backend`, `MongoDB`, `MinIO`를 Docker Compose 또는 동등한 Docker 스택으로 실행할 수 있다.
- `POST /ingest/files`의 `path`는 컨테이너 내부에서 접근 가능한 경로여야 한다.
- host 경로를 그대로 쓰려면 Docker 실행 시 bind mount가 필요하다.
- 예: host/WSL의 `/mnt/c/files`를 컨테이너에서도 `/mnt/c/files`로 쓰려면 `/mnt/c/files:/mnt/c/files` 같은 volume 설정이 필요하다.
- Docker 실행형은 path mount 정책을 운영자가 명시해야 한다.

적합한 경우:
- 서버 배포와 재시작 정책을 컨테이너 기준으로 통일해야 할 때
- MongoDB/MinIO까지 포함한 독립 스택이 필요할 때
- path ingest 대상 폴더가 고정되어 mount 정책을 사전에 정의할 수 있을 때

## 비활성 배포 형태
아래 형태는 보관용으로만 남기고, 현재 기본 계약에는 포함하지 않는다.

- Electron 단일 원클릭 설치형
- 로컬 번들형 백엔드 동시 실행

## 권장안
- 현재 권장안은 Version A, 즉 host/WSL 직접 실행이다.
- Docker 실행형은 추후 운영 요구가 생기면 Version B로 별도 구성한다.
- 두 버전 모두 frontend는 backend HTTP API만 바라본다.

## 런타임 요구사항
- SvelteKit 앱은 백엔드 URL을 설정 가능해야 한다.
- backend는 MongoDB와 MinIO 접속 정보를 환경변수로 받아야 한다.
- Version A에서 `POST /ingest/files`의 `path`는 backend host/WSL 프로세스가 직접 접근 가능한 경로여야 한다.
- Version B에서 `POST /ingest/files`의 `path`는 컨테이너 내부 경로여야 하며, 필요한 host 경로는 bind mount로 연결해야 한다.
- CORS와 파일 다운로드 경로는 명시적이어야 한다.
- 프론트엔드는 MongoDB나 MinIO에 직접 접근하지 않는다.

## 패키징 규칙
- backend 패키지와 frontend 패키지는 서로 독립적으로 버전 관리한다.
- Version A는 Node.js backend 실행, MongoDB 서비스, MinIO 서비스를 각각 로컬/WSL에서 실행한다.
- Version B의 Docker 설정은 backend/MongoDB/MinIO 스택에만 적용한다.
- frontend는 backend API 주소 외에 서버 내부 자격 정보를 알 필요가 없다.
- MongoDB는 조회 정본, MinIO는 이미지 정본이라는 계약을 유지한다.

## 관측 항목
- backend 시작 시간
- frontend 시작 시간
- backend API 응답 지연
- MongoDB 목록/필터 지연
- MinIO 이미지 스트림/다운로드 지연
- 배포 또는 업데이트 실패율
