# Harness Integration Contract

This document defines the repo-level contract for validating oh-my-claudecode harness integration before an agent claims policy compliance.

## Required Gates and Hook Names

The following controls are required when harness is available:

1. `scope-gate` hook (scope enforcement)
2. `context-gate` hook (pre-edit file-read enforcement)
3. `acceptance-gate` hook (completion acceptance checks)
4. `backpressure-gate` hook (failure backpressure / retry pressure)
5. Architect verification (independent completion verification)

## Gate Verification Requirements

Use concrete checks, not assumptions.

### 1) `scope-gate`

- Command:
  - `ls ~/.claude/hooks | rg "scope-gate"`
- Log location:
  - `~/.claude/logs/hook-events.log` (or repo-local hook event logs if configured)
- Signature strings:
  - `scope-gate`
  - `scope_violation`
  - `scope_check_passed`

### 2) `context-gate`

- Command:
  - `ls ~/.claude/hooks | rg "context-gate"`
- Log location:
  - `~/.claude/logs/hook-events.log`
- Signature strings:
  - `context-gate`
  - `pre_edit_read_required`
  - `context_check_passed`

### 3) `acceptance-gate`

- Command:
  - `ls ~/.claude/hooks | rg "acceptance-gate"`
- Log location:
  - `~/.claude/logs/hook-events.log`
- Signature strings:
  - `acceptance-gate`
  - `acceptance_missing_evidence`
  - `acceptance_check_passed`

### 4) `backpressure-gate`

- Command:
  - `ls ~/.claude/hooks | rg "backpressure-gate"`
- Log location:
  - `~/.claude/logs/hook-events.log`
- Signature strings:
  - `backpressure-gate`
  - `retry_blocked`
  - `backpressure_applied`

### 5) Architect verification

- Command:
  - `ls ~/.claude/agents | rg -i "architect"`
- Log location:
  - `~/.claude/logs/agents/architect.log` (or equivalent multi-agent run log)
- Signature strings:
  - `architect_verification_started`
  - `architect_verification_passed`
  - `architect_verification_failed`

## Startup Checklist (Run Before Claiming Compliance)

Run this checklist at session start:

1. Confirm hooks directory exists and is readable.
2. Confirm all four hook names resolve (`scope/context/acceptance/backpressure`).
3. Confirm Architect agent configuration is present.
4. Confirm hook/agent log files are writable and have current-session entries.
5. Trigger one benign action and verify at least one current-session hook log entry appears.
6. Record harness status in your working notes and final PR report.

Recommended quick check sequence:

- `test -d ~/.claude/hooks && echo hooks_ok`
- `for g in scope-gate context-gate acceptance-gate backpressure-gate; do ls ~/.claude/hooks | rg -x "$g"; done`
- `ls ~/.claude/hooks | rg -x "scope-gate|context-gate|acceptance-gate|backpressure-gate" | wc -l` (MUST be `4`)
- `test -d ~/.claude/agents && ls ~/.claude/agents | rg -i "architect"`
- `test -f ~/.claude/logs/hook-events.log && tail -n 20 ~/.claude/logs/hook-events.log`

## Fallback Behavior When a Gate Is Unavailable

If any required gate is unavailable, do not claim fully automated harness compliance for that gate. Apply this downgrade policy:

- Missing `scope-gate`:
  - Downgrade from **MUST (automated scope enforcement)** to **manual scope checklist MUST**.
  - Manually enumerate in-scope files before edits and re-check before commit.
- Missing `context-gate`:
  - Downgrade from **MUST (automated pre-read enforcement)** to **manual pre-edit read checklist MUST**.
  - Record files read before each edit batch.
- Missing `acceptance-gate`:
  - Downgrade from **MUST (automated acceptance checks)** to **manual acceptance checklist MUST**.
  - Require explicit evidence section with commands, outputs, and file citations.
- Missing `backpressure-gate`:
  - Downgrade from **MUST (automated failure pressure)** to **manual stop-and-review MUST**.
  - After any failed verification, halt feature work until failure is resolved or explicitly risk-accepted.
- Missing Architect verification:
  - Downgrade from **MUST (independent verifier)** to **manual two-pass self-review MUST**.
  - Complete a second-pass review using `checklists/verify.md` before claiming done.

When downgrading, final report MUST include:

- Which gate was unavailable
- How manual checklist substitution was applied
- Remaining residual risk

## Known-Failure Matrix

| Symptom | Likely cause | Safe mitigation |
|---|---|---|
| Hook name not found in `~/.claude/hooks` | Partial install or renamed hook file | Re-sync harness install; if blocked, activate manual checklist downgrade and document it |
| Hook exists but no events in `hook-events.log` | Hook not wired to current profile/session | Verify active profile/config, restart session, re-run benign trigger, then recheck logs |
| `acceptance-gate` repeatedly blocks completion | Missing evidence block or required verification fields | Add explicit verification commands/results + file citations, then retry |
| `backpressure-gate` loops on failures | Underlying failing test/check never addressed | Stop retries, fix or scope out failing check, then re-run once with documented rationale |
| Architect log missing for completed task | Architect agent disabled/unavailable in environment | Run manual two-pass verification and mark Architect as downgraded in report |

## Copy-Paste Verification Template

Use this in PR descriptions or completion reports:

```md
### Harness Verification
- scope-gate: [active | unavailable->manual] (evidence: `<command/log snippet>`)
- context-gate: [active | unavailable->manual] (evidence: `<command/log snippet>`)
- acceptance-gate: [active | unavailable->manual] (evidence: `<command/log snippet>`)
- backpressure-gate: [active | unavailable->manual] (evidence: `<command/log snippet>`)
- Architect verification: [active | unavailable->manual] (evidence: `<command/log snippet>`)

### Downgrades (if any)
- Gate: `<name>`
- Manual checklist used: `<checklist/steps>`
- Residual risk: `<brief note>`
```
