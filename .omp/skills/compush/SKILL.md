---
name: compush
argument-hint: [repo-url]
description: Stages, commits, and pushes all changes with an auto-generated commit message. Use when the user says "compush", "커밋", "푸시해", "변경사항 올려", or wants quick commits without PR.
---

# Compush - Automatic Commit and Push

## Goal

Stage, commit, and push changes safely with a concise English commit message.

## Inputs

- `$ARGUMENTS` — the user-provided argument (appended as `User: <args>`): Repository URL (optional). If provided, set/verify remote origin.

## Constraints

| Rule | Rationale |
|------|-----------|
| Respect .gitignore | Never stage ignored files |
| No secrets | Abort if sensitive files detected |
| No force push | Never use `--force` |
| Confirm risky push | Ask before pushing to main/master |
| No archive push | push 전 tracked 로컬 아카이브(sum/reviews/brainstorming) 검사 — 있으면 중단 |

## Process

### 1. Pre-flight checks

```bash
git status
git diff --stat
```

Check for:
- Any changes exist?
- Sensitive files? (`.env`, `*secret*`, `*.key`, `*.pem`)
- Large files (>10MB)?
- Merge conflict markers?

### 2. Remote verification (if URL provided)

```bash
git remote -v
```

If remote differs from provided URL → ask user for action.

**HTTPS to SSH conversion**:
`https://github.com/user/repo` → `git@github.com:user/repo.git`

### 2.5 Closeout check (스테이징 직전)

추적 중인 작업이 완료됐으면 마감한다 — `docs/rules/closeout_contract.md` 절차를 따른다(compr와 동일): seed `status: approved` + `docs/harness/current-scope.md`의 AC 전부 `[x]`이면 → seed `status: done` + `completed: <date>`, `current-scope.md` 삭제, `docs/harness/audit.jsonl`에 `task_closed` append(아래 커밋에 포함). AC 미충족/비추적이면 advisory 후 skip(no-op). `.omp/skills/` 수정 시 전역 미러 동기화. *(compush는 중간 푸시일 수 있으니 git 액션이 아니라 완료 상태에만 키잉됨에 유의.)*

### 3. Stage changes

```bash
git add -A
git diff --cached --name-only
```

If sensitive files detected → unstage and abort.

### 4. Generate commit message

Format: `<type>: <short description>`

**Types**: feat, fix, refactor, docs, style, test, chore

**Rules**:
- Imperative mood ("add" not "added")
- Under 50 characters
- No period at end

### 5. Risk assessment

| Risk | Detection | Action |
|------|-----------|--------|
| Push to main/master | Branch check | Confirm with user |
| Large commit (>20 files) | File count | Warn, ask to proceed |
| Behind remote | git status | Require pull first |

### 6. Commit and push

```bash
# 로컬 아카이브 유출 검사 — 서사는 레포가 아니라 sum-vault에 백업된다 (rules/doc_standards.md)
if [ -n "$(git ls-files docs/sum docs/reviews docs/brainstorming)" ]; then
  echo "push 중단: 로컬 아카이브가 git에 추적 중 — git rm -r --cached docs/sum docs/reviews docs/brainstorming 후 .gitignore 등재"
  exit 1
fi
git commit -m "<message>"
git push --follow-tags
```

`--follow-tags` ensures annotated tags (e.g., a deliberate harness version bump via `scripts/harness-version-bump.sh`) are pushed with the branch in one operation.

### 7. Output

Show:
- Files committed (count + summary)
- Commit message used
- Push result
- Remote URL

## Verification

```bash
git status
git log -1 --oneline
```

Confirm working tree clean and commit exists.

## Error Handling

| Condition | Action |
|-----------|--------|
| No changes | Report and exit |
| Sensitive file | List files, abort |
| Push rejected (non-ff) | Suggest `git pull --rebase` |
| Push rejected (auth) | Suggest SSH key check |
| Behind remote | Require pull first |
| Detached HEAD | Warn, suggest creating branch |
