# 에이전트 실행 계획

이 문서는 `docs/master-plan.md`를 실제 작업 단위로 풀어, 각 하위 에이전트가 어떤 순서로 움직여야 하는지 정의한다.

## 1. 공통 원칙
- 모든 에이전트는 `docs/agent/playbook.md`를 먼저 읽는다.
- 각 스텝은 작업 로그를 남긴다.
- 다음 단계로 넘기기 전에 산출물, 검증, 남은 리스크를 명시한다.
- 문서와 코드가 어긋나면 문서를 먼저 고친다.

## 2. Architecture agent

### Step A1
- 저장소 경계 확정
- 산출물:
  - metadata schema 초안
  - `imageId`, object key, bucket 규칙
  - watcher 파이프라인 규칙
- 종료 기준:
  - backend와 frontend가 같은 경계를 공유한다.

### Step A2
- 폴더 감시 파이프라인 명세 확정
- 산출물:
  - pair 매칭 규칙
  - partial write 정책
  - 삭제/수정 정책
- 종료 기준:
  - backend 구현팀이 watcher를 설계할 수 있다.

### Step A3
- Docker/배포 경계 검토
- 산출물:
  - backend, MongoDB, MinIO, frontend의 런타임 경계 문서
- 종료 기준:
  - 배포팀이 같은 기준을 사용한다.

## 3. Backend agent

### Step B1
- `apps/backend` NestJS skeleton 생성
- 산출물:
  - 모듈 구조
  - health route
  - config 구조
- 종료 기준:
  - 프로젝트가 backend 기준으로 부팅된다.

### Step B2
- `packages/shared` 계약 반영
- 산출물:
  - DTO 연결
  - validation 파이프
- 종료 기준:
  - backend 응답 shape가 shared와 일치한다.

### Step B3
- MongoDB repository와 MinIO adapter 구현
- 산출물:
  - repository 계층
  - MinIO client/adapter
  - config/env 계약
- 종료 기준:
  - 저장소 계층이 backend에서 분리된다.

### Step B4
- 폴더 감시 ingest 구현
- 산출물:
  - watcher
  - pair matcher
  - 안정화 검사
  - ingest queue
- 종료 기준:
  - 폴더 변경이 자동으로 MongoDB와 MinIO에 반영된다.

### Step B5
- 목록/검색/상세/다운로드 API 구현
- 산출물:
  - pagination/filter/search/detail/download API
- 종료 기준:
  - frontend가 backend API만으로 목록과 상세를 구성할 수 있다.

## 4. Frontend agent

### Step F1
- `apps/frontend` SvelteKit 앱 구조 정리
- 산출물:
  - SvelteKit 라우트와 FSD 구조
  - backend API client 연결점
- 종료 기준:
  - frontend skeleton이 실행된다.

### Step F2
- 목록/필터/페이지네이션 UI 구현
- 산출물:
  - 목록 화면
  - 필터 바
  - pagination control
- 종료 기준:
  - 전체 데이터셋 로컬 필터링 없이 backend 결과를 보여준다.

### Step F3
- 상세/이미지 보기/다운로드 구현
- 산출물:
  - metadata panel
  - image viewer
  - multi-select download UX
- 종료 기준:
  - 이미지 보기와 다운로드가 MinIO 경로를 사용한다.

### Step F4
- 대량 데이터 UX 보강
- 산출물:
  - loading/empty/error state
  - 대량 목록 성능 개선
- 종료 기준:
  - 25,000건에서도 멈춘 것처럼 보이지 않는다.

## 5. Integration / QA agent

### Step Q1
- contract smoke test
- 산출물:
  - backend API 검증 시나리오
  - frontend 연결 smoke test
- 종료 기준:
  - 기본 경로가 끊기지 않는다.

### Step Q2
- watcher 기반 E2E 검증
- 산출물:
  - 폴더 투입 -> MongoDB/MinIO -> UI 표시 시나리오
- 종료 기준:
  - 자동 동기화가 재현 가능하다.

### Step Q3
- 실패/복구 시나리오 검증
- 산출물:
  - partial write 재현
  - source missing 재현
- 종료 기준:
  - 실패가 정상 데이터처럼 보이지 않는다.

## 6. Performance agent

### Step P1
- 측정 러너와 기준 지표 고정
- 산출물:
  - benchmark script
  - run id 기준 로그
- 종료 기준:
  - p50/p95를 일관되게 측정할 수 있다.

### Step P2
- 1,000 / 10,000 / 25,000건 측정
- 산출물:
  - 목록/필터/상세/이미지 보기/다운로드 지표
- 종료 기준:
  - 병목 계층이 식별된다.

### Step P3
- 회귀 감시 기준 확정
- 산출물:
  - 기준치
  - 회귀 판정 규칙
- 종료 기준:
  - 이후 변경이 성능 저하를 만들면 바로 보인다.

## 7. Deployment / Packaging agent

### Step D1
- 분리 배포 구조 확정
- 산출물:
  - backend Docker 스택
  - frontend SvelteKit 배포 기준
  - backend/frontend endpoint 연결 계약
- 종료 기준:
  - backend와 frontend의 배포 산출물이 분리되어 있다.

### Step D2
- backend 실행 환경 정리
- 산출물:
  - env template
  - MongoDB/MinIO 연결 설정
  - healthcheck/volume/network 기준
- 종료 기준:
  - backend 스택을 독립적으로 배포할 수 있다.

### Step D3
- frontend 배포 연결
- 산출물:
  - backend endpoint 주입 방식
  - SvelteKit 배포 기준
- 종료 기준:
  - frontend가 backend HTTP API만 바라보고 실행된다.

## 8. Docs keeper

### Step G1
- 문서 재정렬
- 산출물:
  - 새 구조 기준 문서 인덱스
- 종료 기준:
  - stale 문서가 줄어든다.

### Step G2
- 구현 단계마다 문서 동기화
- 산출물:
  - spec/plan/review 갱신
- 종료 기준:
  - 코드와 문서가 어긋나지 않는다.

## 9. Review owner

### Step R1
- 단계별 게이트 정의
- 산출물:
  - 리뷰 체크포인트
  - 반려 기준
- 종료 기준:
  - 각 단계가 같은 기준으로 리뷰된다.

### Step R2
- 머지 전 최종 정합성 점검
- 산출물:
  - 용어, 경계, 책임 분리 검토
- 종료 기준:
  - MongoDB와 MinIO, backend와 frontend의 역할이 뒤섞이지 않는다.

## 10. 총책임자 확인 포인트
- 지금 단계가 `master-plan`의 어느 phase인지
- 산출물이 실제로 존재하는지
- 작업 로그가 남았는지
- 다음 에이전트가 바로 이어받을 수 있는지
- 동일 원인이 다시 발생할 여지가 없는지
