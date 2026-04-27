# 배포 명세

## 목적
이 문서는 이 프로젝트의 기본 배포 방식을 `backend / frontend 분리 배포`로 고정하고, 각 런타임의 책임과 연결 경계를 명확히 한다.

## 기본 원칙
- 백엔드는 Docker 기반 서버로 배포한다.
- 프론트엔드는 SvelteKit 앱으로 별도 배포한다.
- MongoDB와 MinIO는 백엔드가 사용하는 인프라로 관리한다.
- 프론트엔드는 백엔드 HTTP API만 호출한다.
- 배포 방식이 달라도 데이터 계약과 API 계약은 바뀌지 않는다.

## 표준 배포 형태

### 형태 A. 분리 배포
- `backend`를 Docker 이미지 또는 Docker Compose 서비스로 배포한다.
- `MongoDB`와 `MinIO`를 backend 인프라로 함께 배포한다.
- `frontend`는 SvelteKit 앱으로 독립 배포한다.
- SvelteKit 앱은 백엔드의 외부 HTTP 주소를 설정값으로 받는다.

적합한 경우:
- 백엔드와 UI를 서로 다른 주기로 배포해야 할 때
- 운영 환경에서 서버와 클라이언트를 분리 관리해야 할 때
- MongoDB/MinIO를 중앙 인프라로 운영할 때

## 비활성 배포 형태
아래 형태는 보관용으로만 남기고, 현재 기본 계약에는 포함하지 않는다.

- Electron 단일 원클릭 설치형
- 로컬 번들형 백엔드 동시 실행

## 권장안
- 기본 권장안은 `backend / frontend 분리 배포`다.
- backend는 Docker Compose 스택으로, frontend는 SvelteKit 배포 산출물로 따로 관리한다.
- 개발 환경에서만 로컬 실행 조합을 허용한다.

## 런타임 요구사항
- SvelteKit 앱은 백엔드 URL을 설정 가능해야 한다.
- backend는 MongoDB와 MinIO 접속 정보를 환경변수로 받아야 한다.
- CORS와 파일 다운로드 경로는 명시적이어야 한다.
- 프론트엔드는 MongoDB나 MinIO에 직접 접근하지 않는다.

## 패키징 규칙
- backend 패키지와 frontend 패키지는 서로 독립적으로 버전 관리한다.
- Docker 설정은 backend 스택에만 적용한다.
- frontend는 backend API 주소 외에 서버 내부 자격 정보를 알 필요가 없다.
- MongoDB는 조회 정본, MinIO는 이미지 정본이라는 계약을 유지한다.

## 관측 항목
- backend 시작 시간
- frontend 시작 시간
- backend API 응답 지연
- MongoDB 목록/필터 지연
- MinIO 이미지 스트림/다운로드 지연
- 배포 또는 업데이트 실패율
