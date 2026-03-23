<!-- policy-sync-warning:start -->
warning_type: reference_only
non_normative_reference_only: true
last_sync_date: 2026-03-11
source_of_truth: ../CLAUDE.md
source_commit_hash: a89b027917a2ee3b1f6a4456dfd471555a342be7
<!-- policy-sync-warning:end -->

# CLAUDE.md (Team Standard)
이 파일은 항상 로드됩니다. 여러 레포에서 공용으로 사용합니다.
핵심은 “추측 금지 + 짧은 검증 루프 + 자산화(스펙/회고/평가셋)”입니다.

---

## 0) 운영 계약 (필수)

### 목표
가장 적은 리스크로 올바른 변경을 배포한다. 이를 위해 **검증 가능한 루프**를 최우선으로 한다.

### 기본 워크플로우 (항상)
1) **Explore(탐색)**: 관련 파일/설정/CI/락파일을 읽고 사실을 확보한다. 이 단계에서 코드 수정 금지.
2) **Plan(계획)**: 작고 검증 가능한 변경 계획을 제시한다(테스트/평가 포함).
3) **Implement(구현)**: 최소 변경으로 구현한다.
4) **Verify(검증)**: 빠른 검증 → 필요 시 전체 게이트 순으로 실행한다.
5) **Commit/PR(기록)**: 작은 단위로 커밋하고, 결정/가정/회고를 남긴다.

### oh-my-claudecode 통합

이 레포는 **oh-my-claudecode**가 전역으로 활성화되어 있다고 가정한다. 다음 항목은 자동으로 적용된다:

| 항목 | 방법 | 이 파일의 역할 |
|------|------|---------------|
| 코드 변경 | executor 에이전트에 위임 | N/A (전역 규칙) |
| 스코프 적용 | harness `scope-gate` 훅 | 프로젝트별 규칙으로 보완 |
| 편집 전 파일 읽기 | harness `context-gate` 훅 | N/A (자동 적용) |
| 완료 검증 | Architect 에이전트 | 증거 요구사항으로 보완 |
| 실패 시 백프레셔 | harness `backpressure-gate` 훅 | N/A (자동 적용) |

**이 파일이 추가하는 것**: 프로젝트별 제약, 증거 기준, 문서화 요구사항.

Harness 검증 계약 상세: [`../rules/harness_integration_contract.md`](../rules/harness_integration_contract.md)

### 용어 (RFC 2119)
- **MUST**: 필수. 준수할 수 없으면 예외 프로토콜을 따른다.
- **SHOULD**: 기본 기대치. 짧은 이유를 남기면 생략 가능.
- **MAY**: 선택.

### Non-Negotiables (MUST)

- **추측 금지**: 버전, 커맨드, API, 파일을 임의로 발명하지 않는다.
- **레포 커맨드**: build/test/lint/typecheck/e2e/eval 커맨드는 추측하지 않는다. 탐지한다.
- **위험 작업**: 제안/실행 전 명시적 승인 필요.
- **검증**: 사용자 영향 변경에는 재현 가능한 검증 아티팩트가 최소 하나 있어야 한다.
- **Docs/policy-only 모드**: 순수 마크다운/정책/템플릿 편집의 경우 `../rules/verification_tests_and_evals.md`의 docs-only 검증 경로를 따르고 필요한 증거 형식을 포함한다.
- **증거**: 주요 결정에 대해 구체적인 증거(파일 경로 + 발췌 또는 커맨드 출력)를 인용한다.
- **Reference doc sync**: 동일 PR에서 `claudedocs/CLAUDEKR.md`와 `claudedocs/CLAUDE_original.md`를 업데이트하거나 명시적으로 stale로 표시한다.

### Reference doc sync (MUST)
- **Reference doc sync**: in the same PR, update `claudedocs/CLAUDEKR.md` and `claudedocs/CLAUDE_original.md` or explicitly mark them as stale.

### 코스 교정
불명확하면 초기에 멈추고 가정/전제를 명시한다. 컨텍스트가 지저분해지면 작업 단위마다 정리한다.

---

## 1) 안전 & 보안 (Hard Rails)

상세 참조: [`../rules/safety_security.md`](../rules/safety_security.md), [`../rules/agent_security.md`](../rules/agent_security.md)

### 위험 작업은 명시적 승인 필요
다음은 요청/승인 없이 실행/제안하지 않는다:
- 대량 삭제, 히스토리 재작성, force push, 전역 대규모 리팩토링
- 롤백 계획 없는 파괴적 DB 변경/마이그레이션
- 비밀/키/자격증명 취급, 프로덕션 직접 변경

### 보안 규칙
- `.env`, 토큰, 키, 크리덴셜은 민감정보다. PR/이슈/로그/커밋 메시지에 남기지 않는다.
- 필요한 경우 마스킹/최소 노출을 지킨다.

---

## 2) Anti-Hallucination (추측 금지 규율)

### 버전/옵션/API는 추측하지 않는다
중요한 버전/옵션/API는 다음 순서로 “근거”를 확보한다:
1) lockfile / manifest / CI 설정
2) 레포 문서(README, ADR 등)
3) 문서 조회 도구(예: Context7)

검증되지 않은 API/옵션은 사용하지 않는다.

---

## 3) MCP: Context7 규칙

상세 참조: [`../rules/mcp_policy.md`](../rules/mcp_policy.md), [`../rules/context7_policy.md`](../rules/context7_policy.md)

### MCP 서버 정책 (트리거 기반)

| MCP 서버 | 정책 |
|----------|------|
| **Context7** | 신규 외부 API/SDK/dependency, 버전민감 문법에 MUST 사용 |
| **Serena** | 심볼 탐색, 리팩토링, 코드 이해에 SHOULD 사용 |
| **Supabase** | DDL에는 마이그레이션 MUST; 쿼리에는 직접 SQL MAY |
| **Web Search** | 최신 이벤트, 오류, 최신 문서에 SHOULD 사용 |

### Context7 반드시 사용해야 하는 경우
- 신규 dependency 설치/설정
- 외부 API/SDK 사용
- 프레임워크 boilerplate/config 생성
- 버전별 문법/Deprecated 여부 확인

### 사용 방법
- 프롬프트에 `use context7`
- 필요 시 `use library /org/project` (예: `/vercel/next.js`, `/prisma/prisma`)

### 금지
- Context7 없이 라이브러리 관련 코드 생성
- 학습데이터 기반 추측
- 문서에 없는 API/함수/옵션 사용

---

## 4) 핵심 개발 철학

### Simplicity First (최상위)
- 가장 단순한 working code부터. 필요해질 때만 추상화.
- YAGNI/KISS 준수. Rule of Three(중복 3번째에 추상화).
- 미래 예측 기능 추가 금지. 현재 요구사항만 충족.

### Clean Code
- 중복 제거를 최우선
- 네이밍과 구조로 의도 표현
- 함수는 작고 단일 책임
- 상태/사이드이펙트 최소화

### OOP / SOLID (실용 적용)
- 캡슐화: 행동을 노출, getter/setter 남발 금지
- 상속보다 조합, 조건문보다 다형성
- SOLID는 과잉추상화 없이 “필요할 때” 적용

### 코딩 표준

상세 참조: [`../rules/coding_standards.md`](../rules/coding_standards.md)

- **불변성(Immutability)**: 가능하면 불변 데이터 구조를 선호한다. 상태 변이를 최소화한다.
- **파일 크기 제한**: 단일 파일이 너무 길어지면 모듈로 분리한다. 가독성과 유지보수성 우선.
- **단일 책임**: 각 파일/모듈/함수는 하나의 책임만 가진다.

---

## 5) TDD + Tidy First (필수)

### TDD (Kent Beck)
항상 Red → Green → Refactor
- Red: 가장 단순한 실패 테스트부터 (테스트 없이 프로덕션 코드 금지)
- Green: 최소 구현만
- Refactor: green 상태에서만, 실패 시 즉시 롤백

규칙:
- 한 번에 테스트 1개
- 테스트 결정론 보장(시간/랜덤/비동기 통제)
- 유닛 테스트에서 외부 의존성(네트워크/파일/시간/랜덤/DB) 격리

### Tidy First (구조/행동 분리)
- STRUCTURAL(동작 불변)과 BEHAVIORAL(동작 변경)을 같은 커밋에 섞지 않는다.
- 둘 다 필요하면 구조 변경 먼저, 별도 커밋, 이후 행동 변경.

### 버그 수정 프로토콜
1) API 레벨 회귀 테스트 추가
2) 최소 재현 테스트 추가
3) 최소 수정으로 통과
4) green 이후 리팩토링

---

## 6) Verification: Tests + Evaluation Set

상세 참조: [`../rules/verification_tests_and_evals.md`](../rules/verification_tests_and_evals.md)

### EDD (Eval-Driven Development)

EDD는 TDD와 유사하게, 평가셋(eval)을 먼저 정의하고 구현하는 방식이다.

절차:
1) **Eval 정의**: `templates/eval_definition.md`로 입력/기대결과/지표 정의 ([`../templates/eval_definition.md`](../templates/eval_definition.md))
2) **구현**: 최소 변경으로 eval을 통과시킨다
3) **Eval 보고**: `templates/eval_report.md`로 결과 문서화 ([`../templates/eval_report.md`](../templates/eval_report.md))
4) **체크리스트**: `checklists/eval.md`를 사용한다 ([`../checklists/eval.md`](../checklists/eval.md))

### 테스트 피라미드
- Unit: 빠르고 격리된 비즈니스 규칙
- Integration: 경계/DB/인프라 검증
- E2E: 핵심 사용자 여정 최소

### Evaluation Set(평가셋) — 품질 회귀 하네스
테스트만으로 품질을 담기 어려운 영역(검색/랭킹/추천/LLM 출력/포맷 준수/스크린샷 비교/데이터 품질/성능 기준선)은 평가셋을 운영한다.

규칙:
- 새 사용자 영향 동작은 “자동 검증”이 있어야 한다: tests 또는 evals.
- eval은 재현 가능해야 한다(입력+기대결과/지표+버전 관리).
- CI에는 최소 “smoke eval”을 두고, full eval은 주기적으로 실행한다.

권장 디렉토리(레포에 맞게 존재하면 사용):
- `tests/` : unit/integration/e2e
- `eval/` :
  - `eval/cases/` (YAML/JSONL: input/expected/notes)
  - `eval/harness/` (runner)
  - `eval/baselines/` (golden outputs/metrics)
  - `eval/reports/` (generated; 보통 gitignore)

테스트 vs eval 선택:
- 결정론적 계약/로직 → tests
- 통계적/품질/LLM/UX 동등성 → evals
- 애매하면 tests로 시작, 부족한 품질 표면은 eval로 보강

---

## 7) 멀티 레포 공용: “레포 커맨드 자동 탐지” 프로토콜 (중요)

### 원칙: 커맨드는 절대 추측하지 않는다
레포별 실행 커맨드(build/test/lint/typecheck/e2e/eval)는 사람에게 묻거나 임의로 만들지 않는다.
반드시 레포에서 “근거를 찾아” 사용한다.

### 탐지 순서(근거 소스)
1) `package.json`의 `scripts` (JS/TS)
2) `Makefile` / `justfile` / `taskfile.yml`
3) Python: `pyproject.toml`(tool 설정), `noxfile.py`, `tox.ini`, `poetry`/`uv` 설정
4) CI 설정(`.github/workflows/*`, `gitlab-ci.yml` 등)에서 실제 실행 스텝
5) README/CONTRIBUTING에 명시된 명령

### fast vs full 구분
- `test:fast`, `test:unit`, `test:smoke`, `lint`, `typecheck`처럼 “빠른 게이트”가 있으면 우선 실행
- 풀 스위트만 있으면, 먼저 “가장 작은 검증 단위(단일 테스트/스모크)” 실행을 제안하되,
  실제 실행은 레포에서 제공되는 명령으로만 한다.

### 레포에 커맨드가 전혀 없으면
- “추가하자”는 제안은 가능하지만, 무단으로 스크립트를 발명하지 않는다.
- 합의 후에만 `scripts`/Makefile/CI에 표준 커맨드를 추가한다.

---

## 8) 자산화 규칙 (AI 네이티브 루프)

### Spec → Implement → Retro (사소하지 않은 변경은 필수)
- 스펙(이슈/PR 설명 가능)을 남긴다.
- 테스트/평가셋으로 검증한다.
- 회고: 실패/학습/다음 번 프롬프트 개선 포인트를 기록한다.

### 어디에 남길지(최소 규칙)
- 스펙: Issue/PR description
- 결정(왜): `docs/adr/` 또는 PR의 Decision Log
- 회고: PR 코멘트 또는 `docs/retros/`
- 재사용 프롬프트: `.claude/commands/` 또는 `prompts/`

### 템플릿 참조

| 템플릿 | 용도 | 링크 |
|--------|------|------|
| Eval 정의 | 평가셋 입력/기대결과/지표 정의 | [`../templates/eval_definition.md`](../templates/eval_definition.md) |
| Eval 보고 | 평가 결과 문서화 | [`../templates/eval_report.md`](../templates/eval_report.md) |
| 세션 회고 | 세션별 학습/개선 기록 | [`../templates/session_retro.md`](../templates/session_retro.md) |

PR 최소 포함:
- 변경 요약(1–3 bullets)
- 수행한 검증(tests/eval)
- 리스크/롤백(해당 시)
- 새 가정/결정/회고(해당 시)

---

## 9) 커밋 규율 (필수)

- 관련 테스트/eval이 green일 때만 커밋
- 린트/타입체크는 레포 기준을 따른다
- 작은 커밋 선호
- 구조 변경과 행동 변경은 분리 커밋
- 필요 시 커밋 메시지에 STRUCTURAL/BEHAVIORAL 표시

---

## 10) 유지보수 원칙 (이 파일 자체)

- 이 파일은 항상-on 레일이다. 길어지면 `docs/`로 내리고 여기엔 링크만 둔다.
- 같은 실패가 반복되면 “트리거 기반 규칙”으로 예방한다.
- 장문 철학보다 체크리스트/프로토콜을 선호한다.

### 연결된 모듈

| 모듈 | 링크 |
|------|------|
| 안전 & 보안 | [`../rules/safety_security.md`](../rules/safety_security.md) |
| 에이전트 보안 | [`../rules/agent_security.md`](../rules/agent_security.md) |
| Anti-hallucination & 증거 | [`../rules/anti_hallucination.md`](../rules/anti_hallucination.md) |
| 레포 커맨드 탐지 | [`../rules/repo_command_discovery.md`](../rules/repo_command_discovery.md) |
| MCP 서버 정책 | [`../rules/mcp_policy.md`](../rules/mcp_policy.md) |
| Context7 트리거 정책 | [`../rules/context7_policy.md`](../rules/context7_policy.md) |
| 검증 (테스트 + eval) | [`../rules/verification_tests_and_evals.md`](../rules/verification_tests_and_evals.md) |
| 변경 제어 | [`../rules/change_control.md`](../rules/change_control.md) |
| 문서화 정책 | [`../rules/documentation_policy.md`](../rules/documentation_policy.md) |
| 자산화 | [`../rules/assetization.md`](../rules/assetization.md) |
| 커밋/PR 규율 | [`../rules/commit_and_pr.md`](../rules/commit_and_pr.md) |
| TDD 정책 | [`../rules/tdd_policy.md`](../rules/tdd_policy.md) |
| Harness 통합 계약 | [`../rules/harness_integration_contract.md`](../rules/harness_integration_contract.md) |
| 코드 리뷰 정책 | [`../rules/code_review_policy.md`](../rules/code_review_policy.md) |
| 품질 게이트 | [`../rules/quality_gates.md`](../rules/quality_gates.md) |
| 컨텍스트 관리 | [`../rules/context_management.md`](../rules/context_management.md) |
| 비용 인식 | [`../rules/cost_awareness.md`](../rules/cost_awareness.md) |
| 학습 정책 | [`../rules/learning_policy.md`](../rules/learning_policy.md) |
| 코딩 표준 | [`../rules/coding_standards.md`](../rules/coding_standards.md) |
| 훅 레시피 | [`../rules/hook_recipes.md`](../rules/hook_recipes.md) |
| 세션 지속성 | [`../rules/session_persistence.md`](../rules/session_persistence.md) |

### 체크리스트

| 체크리스트 | 링크 |
|-----------|------|
| 계획 | [`../checklists/plan.md`](../checklists/plan.md) |
| 검증 | [`../checklists/verify.md`](../checklists/verify.md) |
| 위험 작업 | [`../checklists/risky_actions.md`](../checklists/risky_actions.md) |
| 버그 수정 | [`../checklists/bugfix.md`](../checklists/bugfix.md) |
| PR 본문 | [`../checklists/pr.md`](../checklists/pr.md) |
| 코드 리뷰 | [`../checklists/code_review.md`](../checklists/code_review.md) |
| 품질 게이트 | [`../checklists/quality_gate.md`](../checklists/quality_gate.md) |
| Eval (EDD) | [`../checklists/eval.md`](../checklists/eval.md) |
| 구현 전 리서치 | [`../checklists/research_before_implement.md`](../checklists/research_before_implement.md) |

### 템플릿

| 템플릿 | 링크 |
|--------|------|
| 가정 | [`../templates/assumptions.md`](../templates/assumptions.md) |
| 변경 로그 | [`../templates/decision_log.md`](../templates/decision_log.md) |
| PR 설명 | [`../templates/pr_body.md`](../templates/pr_body.md) |
| 회고 | [`../templates/retro.md`](../templates/retro.md) |
| Eval 정의 | [`../templates/eval_definition.md`](../templates/eval_definition.md) |
| Eval 보고 | [`../templates/eval_report.md`](../templates/eval_report.md) |
| 세션 회고 | [`../templates/session_retro.md`](../templates/session_retro.md) |


