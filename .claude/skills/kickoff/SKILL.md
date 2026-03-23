---
allowed-tools: Read, Write, Glob, Grep, Bash(cat:*), Bash(ls:*), Bash(echo:*), Bash(date:*), AskUserQuestion
argument-hint: [project name or feature description]
description: Project/feature kickoff interview (JTBD -> Context -> Scope -> Acceptance -> Backpressure)
---

# Kickoff - Project/Feature Start Interview

## Goal

Gather essential information before any implementation begins. Ensures work starts with clear purpose, scope, and success criteria.

No coding. Only information gathering + state file saving to `docs/harness/`.

## Non-Negotiables

| Rule | Violation = STOP |
|------|------------------|
| **No implementation** | This is interview only |
| **No guessing** | Discover from repo, not assume |
| **All 5 phases required** | Cannot skip phases |
| **User confirmation per phase** | Each phase needs explicit approval |
| **Output must be saved** | Kickoff summary required |

## Inputs

- `$ARGUMENTS`: Project name or feature description
  - `"새 프로젝트"` / `"new project"` → full kickoff (Vision + all phases)
  - `"로그인 기능"` / `"add feature X"` → feature kickoff (skip Vision, start at JTBD)

## Workflow

### Phase 0: JTBD (Job To Be Done)

**질문** (AskUserQuestion 도구 사용):
1. 이 작업의 최종 사용자는 누구인가?
2. 사용자가 해결하려는 문제는 무엇인가?
3. 성공했을 때 사용자의 상태는 어떻게 달라지는가?

**Gate**: 성공 기준이 1-2문장으로 정리될 때까지 진행하지 않음

**Output**:
```markdown
### JTBD
- User: <who>
- Problem: <what>
- Success: <measurable outcome>
```

---

### Phase 1: Context Discovery

**Agent가 수행** (사용자에게 묻지 않음):
1. 프로젝트 구조 파악 (Glob, Read)
2. 기존 패턴 확인 (package.json, CLAUDE.md, README)
3. 기술 스택 확인
4. 빌드/테스트/린트 명령어 발견

**Gate**: 증거 없이 추측하지 않음. 모르면 "확인 필요"로 표시.

**Output**:
```markdown
### Context
- Repo type: <monorepo/single/docs-only>
- Tech stack: <discovered or "N/A">
- Build cmd: <discovered or "N/A">
- Test cmd: <discovered or "N/A">
- Existing patterns: <list or "none found">
- Risks/constraints: <list>
```

---

### Phase 2: Scope Definition

**질문** (AskUserQuestion 도구 사용):
1. 이번에 반드시 해야 하는 것은? (MUST)
2. 하면 좋지만 필수는 아닌 것은? (SHOULD)
3. 명시적으로 하지 않을 것은? (MUST NOT)
4. 관련 있지만 별도 처리할 것은? (OUT OF SCOPE)

**Gate**: MUST가 최소 1개, OUT OF SCOPE가 최소 1개 정의될 때까지

**Output**:
```markdown
### Scope
- MUST: <list>
- SHOULD: <list>
- MUST NOT: <list>
- OUT OF SCOPE: <list>
```

---

### Phase 3: Acceptance Criteria

**질문** (AskUserQuestion 도구 사용):
1. 이 기능이 동작한다는 것을 어떻게 증명할 수 있는가?
2. 엣지 케이스는 무엇인가?
3. 실패 시나리오는 어떻게 처리해야 하는가?

**Gate**: 최소 3개의 구체적인 수락 기준이 정의될 때까지

**Output**:
```markdown
### Acceptance Criteria
1. <specific, testable criterion>
2. <specific, testable criterion>
3. <specific, testable criterion>

### Edge Cases
- <case 1>
- <case 2>
```

---

### Phase 4: Backpressure Setup

**Agent가 확인 + 사용자 질문**:
1. Context에서 발견한 테스트/빌드 명령어 확인
2. 자동화된 검증이 없으면 → 수동 검증 방법 질문

**Gate**: 검증 방법이 최소 1개 정의될 때까지

**Output**:
```markdown
### Backpressure
- Verification method: <test cmd / manual checklist / rubric>
- How to run: <command or steps>
```

---

### Completion: Save & Signal (MANDATORY)

**⚠️ 이 단계를 건너뛰면 안 됨. 반드시 3개 파일을 저장해야 kickoff 완료.**

#### Step 1: kickoff-done 플래그 생성
```bash
echo "$(date -Iseconds)" > docs/harness/kickoff-done
```

#### Step 2: kickoff-summary.md 저장
Write 도구로 `docs/harness/kickoff-summary.md`에 아래 Output Format 전체 저장.

#### Step 3: current-scope.md 저장
Write 도구로 `docs/harness/current-scope.md`에 Scope 섹션만 추출하여 저장:

```markdown
# Current Scope: <project/feature name>

**Created**: <date>

## MUST
<list>

## SHOULD
<list>

## MUST NOT
<list>

## OUT OF SCOPE
<list>
```

#### Step 4: 다음 단계 안내
저장 완료 후 출력:
> "Kickoff 완료. 상태 파일 저장됨. 구현을 시작하려면 `/startdev`를 사용하세요."

---

## Output Format

```markdown
## Kickoff Summary: <project/feature name>

**Date**: YYYY-MM-DD
**Type**: New Project / Feature

### JTBD
- User: <who>
- Problem: <what>
- Success: <measurable outcome>

### Context
- Repo type: <type>
- Tech stack: <stack>
- Build/Test: <commands>
- Patterns: <list>

### Scope
- MUST: <list>
- SHOULD: <list>
- MUST NOT: <list>
- OUT OF SCOPE: <list>

### Acceptance Criteria
1. <criterion>
2. <criterion>
3. <criterion>

### Backpressure
- Method: <verification>
- Command: <how to run>

---
Kickoff complete. Ready for implementation.
Next: `/startdev` or manual planning.
```

## State Management

| File | Purpose | When |
|------|---------|------|
| `docs/harness/kickoff-done` | Flag that kickoff completed | Created at end |
| `docs/harness/kickoff-summary.md` | Saved summary | Created at end |
| `docs/harness/current-scope.md` | Active scope definition | Created at end |

## Integration with Hooks

- **kickoff-detector** (UserPromptSubmit): 새 작업 감지 시 "/kickoff 먼저 실행하세요" 리마인더
- **scope-gate** (PreToolUse): OUT OF SCOPE 경로 변경 시 블록 (미구현)
- **acceptance-gate** (Stop): Acceptance criteria 없이 "done" 주장 시 경고 (미구현)

## References

- `assets/kickoff_checklist.md` — 전체 체크리스트
- `temp/harness-master.md` — Harness 설계 문서

## Patterns Applied

`constraints_first`, `explicit_output_schema`, `staged_workflow`, `human_in_the_loop`, `evidence_first`
