# AGENTS.md

## 작업 전 필독
이 폴더는 최종 사용자 UI인 SvelteKit 프론트엔드다.

작업 시작 전에 아래 문서를 읽는다.

1. `../../AGENTS.md`
2. `./docs/frontend-v1-spec.md`
3. `./docs/api-contract.md`
4. `./docs/sveltekit-app-usage.md`
5. `../../docs/frontend/spec.md`

## 저장소 범위
- 대상은 SvelteKit + Svelte + TypeScript 프런트엔드 v1이다.
- 저장소 밖의 폴더, 외부 리포지토리, 외부 문서 경로는 참조하지 않는다.
- 요청받은 범위만 수정한다. 요청되지 않은 기능, 추상화, 에러 처리는 추가하지 않는다.
- 기존 사용자 변경은 되돌리지 않는다.

## 구현 원칙
- FSD 구조를 따른다: `app / pages / widgets / features / entities / shared`
- v1 범위만 구현한다.
- UI, 상태, API 계약은 `./docs/frontend-v1-spec.md`와 `./docs/api-contract.md`를 우선한다.
- 불명확하면 추측하지 말고 멈춘 뒤 질문한다.

## v1 범위
- `productId` 기준으로 병합된 제품 단위 파일 리스트 조회
- MongoDB-style pagination dummy API
- metadata 필터: `dateFrom`, `dateTo`, `productId`, `div`, `result`
- 같은 `productId` 이미지 4종과 metadata 상세 보기
- 브라우저 다운로드를 통한 제품 묶음 ZIP 다운로드
- 체크박스 선택 및 선택 제품 ZIP 다운로드

## 검증 명령
- `npm run check`
- `npm run build`
- `npm test`
- 로컬 개발 서버는 `npm run dev`
