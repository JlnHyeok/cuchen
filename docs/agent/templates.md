# 에이전트 템플릿

이 문서는 작업 로그, incident 기록, 리뷰 체크리스트 템플릿을 한 곳에 모아둔 문서다.

## 1. 작업 로그 템플릿

### 사용 규칙
- 스텝이 시작되면 로그 파일을 만든다.
- 스텝이 끝나면 변경사항, 검증, 남은 리스크를 갱신한다.
- 사용자와의 대화에서 결정된 내용은 요약해서 남긴다.
- 다음 에이전트는 이 로그를 먼저 읽고 이어서 작업한다.

### 권장 경로
- `docs/agent/logs/YYYY-MM-DD-step-name.md`

### 템플릿
```md
# 작업 로그

## Step
- 예: Backend ingest 1차 구현

## Date
- YYYY-MM-DD

## Owner
- 담당 에이전트 이름

## Goal
- 이번 스텝의 목표

## Scope
- 수정 대상 파일
- 책임 범위

## Conversation Summary
- 사용자 요청 요약
- 이번 스텝에서 합의된 결정
- 보류한 사항

## Changes
- 변경한 내용
- 변경 이유

## Validation
- 실행한 테스트
- 수동 검증
- 확인 결과

## Risks / Open Items
- 남은 리스크
- 다음 스텝에서 확인할 점

## Next Owner
- 다음 담당 에이전트
```

## 2. Incident 템플릿

### 사용 규칙
- 같은 원인의 문제가 반복되지 않게 남긴다.
- 원인은 한 문장으로 끝내지 말고 재현 조건까지 쓴다.
- fix와 prevention을 분리한다.
- 관련 파일을 꼭 적는다.

### 템플릿
```md
# Incident

## Summary

## Date

## Impact

## Root Cause

## Detection

## Fix

## Prevention

## Related Files

## Notes
```

## 3. 리뷰 체크리스트

### 기능
- [ ] 명세와 일치한다
- [ ] 입력과 출력이 backend, MinIO, frontend 사이에서 어디로 흐르는지 정의돼 있다
- [ ] 실패 경로가 있다
- [ ] 중복/재시도 처리 기준이 있다
- [ ] MongoDB와 MinIO의 역할 분리가 문서와 구현에서 일치한다

### 성능
- [ ] p50/p95를 확인했다
- [ ] 데이터 규모를 명시했다
- [ ] 병목 가능 지점을 backend, frontend, MongoDB, MinIO로 나눠 확인했다

### 정합성
- [ ] MongoDB는 목록/검색의 정본이다
- [ ] MinIO는 이미지와 원본 객체의 정본이다
- [ ] UI와 백엔드 계약이 맞는다
- [ ] 오래된 상태가 남지 않는다
- [ ] partial write가 완료 데이터처럼 보이지 않는다

### 운영
- [ ] ingest, search, detail, image, frontend API 요청 로그가 남는다
- [ ] 재현 방법이 있다
- [ ] 복구 방법이 있다
- [ ] MongoDB 성공 / MinIO 실패, MinIO 성공 / MongoDB 실패를 재현할 수 있다
- [ ] 각 스텝의 변경사항 로그가 있다
- [ ] 각 스텝의 대화 요약 로그가 있다

### MongoDB 도입 후 필수 테스트
- [ ] ingest가 MongoDB 문서와 MinIO object를 같은 `imageId`로 만든다
- [ ] 재ingest가 upsert/idempotent 동작으로 수렴한다
- [ ] MongoDB 실패 시 frontend 목록에 반영되지 않는다
- [ ] MinIO 실패 시 상세/이미지 조회가 partial state를 드러낸다
- [ ] 로그에 correlation id 또는 batch id가 남는다
- [ ] MongoDB upsert latency, MinIO put/get latency, frontend API 요청 실패율을 분리해서 본다

### 산출물
- [ ] 발견한 문제
- [ ] 영향 범위
- [ ] 근거
- [ ] 수정 제안
- [ ] 작업 로그 경로
