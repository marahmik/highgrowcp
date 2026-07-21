# Agent Routing Policy

프로젝트 전용 서브에이전트의 호출 기준을 정의한다.
이 에이전트들은 `.omp/agents/`에 정의되어 있다. OMC 에이전트(executor, architect, verifier 등)는 OMP의 task 도구가 디스커버리해 호출한다 — OMC의 훅 자동화(매직 키워드, system-reminder 주입 등)는 OMP에서 동작하지 않으며, 라우팅은 본 정책과 에이전트 정의로만 이뤄진다.

## 라우팅 기준

### 판단 흐름

```
구현 완료 후 검증 필요?
  → verifier (AC/하네스 기반 완료 검증)
코드 변경의 품질 리뷰 필요?
  → reviewer (3-pass 적대적 리뷰)
그 외 (탐색/조사/구현)?
  → 직접 처리 또는 빌트인 에이전트 사용 (scout, task, OMC executor 등)
```

### 에이전트별 트리거

| 에이전트 | 트리거 조건 | 비트리거 (직접 처리) |
|----------|-------------|---------------------|
| **reviewer** | 코드 변경 후 품질 리뷰 (3-pass: self + GPT adversary + OMC) | 단순 문서/설정 변경 |
| **verifier** | 구현 완료 주장 전 AC/하네스/테스트 검증 | AC가 정의되지 않은 탐색적 작업 |

### 검증 에이전트 호출 기준

- **reviewer**: SHOULD 코드 변경이 10줄 이상이거나 로직 변경을 포함할 때 호출. 결과는 `docs/reviews/`에 자동 기록.
- **verifier**: MUST 작업 완료를 사용자에게 보고하기 전에 호출. AC가 있는 경우 필수. `task` 스폰은 논블로킹(비동기 job 배달)이므로 **스폰만으로는 완료가 아니다 — verifier의 verdict가 실제로 도착한 뒤에만 완료를 선언한다.**
- **운영 팁**: 완료된 서브에이전트는 잠시 idle로 살아있다(이후 parked). reviewer/verifier 후속 질의는 재스폰 대신 `hub`(send)로 해당 에이전트에 이어가면 컨텍스트를 보존한다.

## 폐기된 MCP 라우팅 (2026-06-10)

researcher(Exa)/db-worker(Supabase)/refactorer(Serena)/full-context(복합) 4종의
MCP 위임 라우팅과 에이전트 정의를 제거했다.

- **근거**: 전 프로젝트·전 기간 세션 로그 실측에서 위임 0회 (같은 기간
  OMC executor 1,044회 — 작업량 부재가 아니라 라우팅 자체가 한 번도 선택되지
  않음). 외부 조사·DB·리팩터링 작업은 빌트인(explore(현 scout)/task/web_search)과
  직접 MCP 호출이 흡수했다.
- **재도입 트리거**: 특정 MCP 도메인 작업이 반복되며 직접 처리의 마찰이
  관측될 때, 해당 도메인 1종만 우선 복원(전체 매트릭스 부활 금지).
  복원은 git history의 에이전트 정의(구 `.claude/agents/`, 현 `.omp/agents/`) 참조.
