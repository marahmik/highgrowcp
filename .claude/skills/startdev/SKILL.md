---
allowed-tools: Read, Write, Edit, Bash(mkdir:*), Bash(git status:*), Glob, Grep
argument-hint: <epic or task description>
description: Fresh start for implementation with mandatory TDD gates
---

# Startdev - Implementation with Mandatory Gates

## Goal

Start implementation with enforced TDD discipline. No shortcuts.

## Non-Negotiables

| Rule | Violation = STOP |
|------|------------------|
| **No code before test plan** | Gate 1 must pass |
| **No implementation before RED** | Failing test must exist first |
| **No "done" before checklist** | Gate 3 must pass |
| **No scope creep** | Only what's in the epic/task |
| **Discover, don't guess** | Find paths/commands from repo |

## Inputs

- `$ARGUMENTS`: What to implement
  - `"epic 4"` / `"epic4"` / `"에픽 4"` → find and read epic file
  - `"로그인 기능"` → use as task description

## Workflow with Mandatory Gates

### Phase 0: Context Setup
```
1. mkdir -p docs/sum
2. Write session summary (if conversation exists)
3. Run /compact (proceed even if refused)
4. Read CLAUDE.md
5. Read references/tdd_rules.md
```

### Phase 1: Understand
```
1. Find epic file: Glob **/epic*<number>*.md
2. Extract:
   - [ ] User stories
   - [ ] Acceptance criteria
   - [ ] Scope boundaries (what's NOT included)
3. Output: "## Task Understanding" summary
```

**User confirmation required before proceeding.**

### ⛔ GATE 1: Test Plan (MANDATORY)

**Cannot proceed to implementation without this.**

```markdown
## Test Plan for: <task>

### Unit Tests
- [ ] Test case 1: <input> → <expected>
- [ ] Test case 2: <input> → <expected>

### Edge Cases
- [ ] Empty input
- [ ] Invalid input
- [ ] Boundary values

### Integration Tests (if applicable)
- [ ] <scenario>
```

Use `assets/test_plan_template.md` for full template.

**Output test plan. Get user approval. Then proceed.**

### Phase 2: RED - Write Failing Test

```
1. Write FIRST test (smallest unit)
2. Run test → MUST FAIL
3. If test passes → STOP, test is wrong
4. Commit: "test: add failing test for <feature>"
```

**Show failing test output before proceeding.**

### Phase 3: GREEN - Minimal Implementation

```
1. Write MINIMUM code to pass the test
2. No extra features
3. No "while I'm here" improvements
4. Run test → MUST PASS
5. Commit: "feat: implement <feature>"
```

**Check against `references/anti_patterns.md` before proceeding.**

### Phase 4: TIDY - Clean Only What You Touched

```
1. Only files you modified
2. Only structural changes
3. Run tests → MUST PASS
4. Commit: "refactor: tidy <what>"
```

### ⛔ GATE 2: Cycle Check

Before next feature:
- [ ] Test exists and passes?
- [ ] Implementation is minimal?
- [ ] No scope creep?

**Repeat Phase 2-4 for each test case in the plan.**

### ⛔ GATE 3: Completion Checklist

**Cannot declare "done" without all checks passing.**

```markdown
## Completion Checklist

### Tests
- [ ] All planned tests implemented
- [ ] All tests passing
- [ ] Edge cases covered

### Code Quality
- [ ] No hardcoded values
- [ ] No TODO comments left
- [ ] No console.log / print debugging

### Scope
- [ ] Only requested features implemented
- [ ] No extra "improvements"
- [ ] Matches acceptance criteria

### Ready for Review
- [ ] Commits are atomic (one thing per commit)
- [ ] Commit messages are clear
- [ ] No merge conflicts
```

Use `references/implementation_checklist.md` for full checklist.

## Output Format

```markdown
## Implementation Complete

### Task
<what was implemented>

### Test Coverage
- Unit tests: N
- Edge cases: N
- All passing: ✓

### Commits
1. `abc1234` — test: ...
2. `def5678` — feat: ...
3. `ghi9012` — refactor: ...

### Checklist
- [x] All gates passed
- [x] No anti-patterns detected

### Next Steps
<if any follow-up needed>
```

## References (load as needed)

- `references/tdd_rules.md` — RED→GREEN→TIDY cycle details
- `references/implementation_checklist.md` — Full completion checklist
- `references/anti_patterns.md` — "대충 구현" detection
- `assets/test_plan_template.md` — Test plan template

## Patterns Applied

`constraints_first`, `explicit_output_schema`, `reason_act_loop`, `safety_guard`, `iteration_limit`
