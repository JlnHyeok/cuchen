# 에이전트 문서 인덱스

이 문서는 이 프로젝트의 하위 에이전트 운영 문서 진입점이다.

## 목적
- 루트 `AGENTS.md`의 실행 지침과 세부 에이전트 운영 문서를 분리한다.
- 하위 에이전트가 같은 계약, 같은 용어, 같은 인수인계 형식을 따르게 한다.
- 구현 중 반복되는 실수를 줄이고 재발 방지 기록을 남긴다.

## 구성
- `docs/agent/playbook.md`: 읽기 맵, 행동지침, 인수인계 규칙
- `docs/agent/roadmap.md`: 총괄 단계별 계획과 역할
- `docs/agent/governance-execution-plan.md`: governance 실행 계획 메모
- `docs/agent/templates.md`: 작업 로그, incident, 리뷰 체크리스트 템플릿

## 운영 원칙
- 즉시 실행해야 하는 공통 규칙은 루트 `AGENTS.md`에 둔다.
- 역할별 읽기 맵, 인수인계, 템플릿은 여기서 관리한다.
- 같은 주제의 규칙 문서를 중복으로 만들지 않는다.
- 계약 변경이 생기면 `docs/architecture/`, `docs/backend/`, `docs/frontend/`와 함께 맞춘다.
- 각 작업 스텝마다 변경사항과 대화 요약을 로그나 Markdown으로 남긴다.
- 모든 에이전트는 루트 `AGENTS.md`를 먼저 읽고, `docs/agent/playbook.md`에 정의된 필수 문서만 추가로 읽는다.

## 시작 순서
1. `AGENTS.md`
2. `docs/agent/README.md`
3. `docs/agent/playbook.md`
4. 자기 역할과 가까운 `docs/*/spec.md`
5. 작업 시에는 `docs/agent/templates.md` 템플릿 사용
