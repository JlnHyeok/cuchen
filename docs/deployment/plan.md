# 배포 계획

## 1단계. 분리 배포 정책 고정
- backend와 frontend를 독립 산출물로 둔다.
- `docs/deployment/spec.md`의 표준 배포 형태를 분리 배포로 고정한다.
- 비활성 배포 형태는 보관용으로만 유지한다.

## 2단계. backend 배포 스택 구성
- backend는 Docker Compose 또는 동등한 Docker 스택으로 묶는다.
- MongoDB, MinIO, backend의 연결 정보와 볼륨 정책을 정의한다.
- backend가 외부 HTTP 요청을 안정적으로 받을 수 있게 health check를 둔다.

## 3단계. frontend 배포 산출물 정의
- SvelteKit 앱을 backend와 분리된 배포 산출물로 정의한다.
- frontend는 backend URL만 받아 실행할 수 있어야 한다.
- 프론트 패키징과 backend 스택은 서로 독립적으로 릴리스 가능해야 한다.

## 4단계. 환경 설정 정의
- backend URL
- MongoDB 연결 문자열
- MinIO 엔드포인트와 자격 정보
- frontend가 참조할 backend endpoint

## 5단계. 릴리스 검증
- backend 단독 기동 확인
- frontend 단독 기동 후 backend 연결 확인
- 목록/검색/페이지네이션 확인
- 이미지 보기와 다운로드 확인
- Docker 스택 재시작 및 복구 확인
