# Frontend Specification

## 기술 스택
- SvelteKit + Svelte + TypeScript

## 역할
- 프론트는 조회 전용 UI다.
- 프론트엔드는 backend HTTP API를 호출한다.
- 프론트엔드는 MongoDB나 MinIO에 직접 접근하지 않는다.

## 현재 네트워크 경로
- SvelteKit 앱은 `/images/search`, `/images/:imageId/metadata`, `/images/:imageId/blob`, `/images/:imageId/download` 등 backend HTTP API를 사용한다.
- 버킷 선택, 목록 조회, 필터 적용은 모두 backend 응답을 기준으로 한다.
- Electron desktop은 별도 앱으로 유지할 수 있지만 최종 프론트엔드 계약의 기준은 `apps/frontend`의 SvelteKit이다.

## 목표 경계
- 목록 조회, 페이징, 필터링은 백엔드 경유로 처리한다.
- 백엔드는 MongoDB 기준으로 페이지 단위 목록을 반환한다.
- 이미지 보기와 다운로드는 백엔드가 제공하는 blob/thumbnail/download 경로를 사용한다.
- 프론트엔드는 전체 데이터셋을 메모리에 올려서 필터링하지 않는다.

## UI 구조
- 상단
  - 버킷 선택
  - 필터 바
  - 다운로드 버튼
- 중앙
  - 페이지 단위 파일 목록
  - 선택 상태
  - 페이지네이션
- 우측 또는 모달
  - 이미지 미리보기
  - metadata

## 사용자 동작
- 한 번에 하나의 이미지를 열어볼 수 있어야 한다.
- 페이징과 필터 변경은 서버 조회를 다시 수행해야 한다.
- 이미지 보기와 다운로드는 backend API를 통해 동작해야 한다.
- 로딩 중 상태와 빈 상태를 명확히 보여야 한다.

## 관측 포인트
- 초기 로딩 시간
- 버킷 전환 시간
- 페이지 전환 시간
- 필터 적용 시간
- 이미지 조회 시간
