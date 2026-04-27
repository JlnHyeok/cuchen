# 배포 리뷰 관점

## 형태 리뷰
- 분리 배포가 기본 계약으로 명확히 고정되어 있는가
- backend와 frontend의 릴리스 단위가 섞이지 않는가
- 비활성 배포 형태가 활성 문서에서 다시 살아나지 않는가

## 계약 리뷰
- frontend가 backend HTTP API만 바라보는가
- backend가 MongoDB와 MinIO 책임을 모두 보존하는가
- 이미지 보기/다운로드가 backend API를 통해 일관되게 동작하는가

## 운영 리뷰
- 설정값이 backend/frontend로 나뉘어 명시적인가
- 시작 실패가 backend, frontend, MongoDB, MinIO로 분리되어 보이는가
- 장애를 서로 구분해서 진단할 수 있는가

## Docker 리뷰
- backend 스택의 포트, 볼륨, 환경변수가 문서화되어 있는가
- MongoDB와 MinIO가 backend 인프라로 명확히 연결되는가
- 재시작과 복구 절차가 있는가
- 로그를 확인할 수 있는가
