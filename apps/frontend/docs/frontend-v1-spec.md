# Frontend v1 Spec

## 목표
- 제품 단위 파일 목록을 조회하고, 필터링하고, 이미지 상세 보기와 제품 묶음 다운로드를 수행한다.
- 첫 화면은 목록 화면이다. 별도의 랜딩 화면은 두지 않는다.

## 기술과 구조
- SvelteKit + Svelte + TypeScript
- FSD 구조를 따른다.
- SvelteKit 라우트는 `src/routes`에 둔다.
- FSD 코드는 `src/lib` 아래에서 구조를 따른다.
- FSD 경계:
  - `app`: 진입, 라우팅, 전역 조립
  - `pages`: 화면 단위 조립
  - `widgets`: 목록/페이징처럼 여러 기능을 조합한 화면 블록
  - `features`: 필터 입력, 미리보기 열기, 다운로드 실행
  - `entities`: 파일 도메인 타입과 매핑
  - `shared`: API, UI, lib, config, types

## v1 화면
- 제품 단위 파일 목록
- 필터 바: `dateFrom`, `dateTo`, `productId`, `div`, `result`
- 결과 영역: 테이블 또는 리스트, 페이지네이션
- 제품 이미지 상세: 선택한 행과 같은 `productId`의 이미지 4종을 모달에서 함께 표시
- 제품 묶음 다운로드: 브라우저 기본 다운로드 사용
- 선택 다운로드: 테이블 왼쪽 체크박스로 선택한 제품들을 헤더 버튼에서 ZIP으로 저장

## 동작 규칙
- 필터 변경 시 목록을 다시 조회한다.
- 날짜 필터는 범위 검색이다.
- 목록은 `productId` 기준으로 병합해 제품 1개당 대표 행 1개만 표시한다.
- 대표 행의 구성 값은 같은 제품에 속한 이미지 개수를 기준으로 `4종`처럼 표시한다.
- metadata는 `product_id`, `div`, `time`, `result`, `threshold`, `prob`를 화면에 표시한다.
- 상세 모달은 같은 `productId`에 속한 `top`, `bot`, `top-inf`, `bot-inf` 이미지를 가능한 만큼 함께 표시하고 각 이미지의 metadata를 같이 보여준다.
- 이미지 파일만 미리보기 대상으로 취급한다.
- 행 다운로드는 해당 제품 묶음의 이미지들을 ZIP으로 저장한다.
- 헤더에는 선택된 제품 개수와 선택 다운로드 버튼을 표시한다.
- 목록과 미리보기는 API 응답의 메타데이터를 기준으로 렌더링한다.

## 권장 FSD 배치
```text
src/
  routes/
  lib/
    app/
    pages/
    widgets/
    features/
    entities/
    shared/
```

## 비범위
- 업로드
- 편집
- 외부 폴더 참조
- v1에 없는 부가 화면

## 검증
- `npm run check`
- `npm run build`
- `npm test`
- 로컬 화면 확인은 `npm run dev`를 사용한다.
