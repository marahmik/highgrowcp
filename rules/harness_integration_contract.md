# Harness Integration Contract

This document defines the repo-level contract for validating harness integration before an agent claims policy compliance.

## Gate Location

All gates live in `.omp/extensions/harness/gates/` and are wired into the OMP event model by the extension `.omp/extensions/harness/index.ts` (each gate is spawned as a stdin-JSON CLI via `runGate("<gate>.mjs", payload)`; exit 0 = allow, exit 2 = block, stderr `HARNESS WARNING` = advisory).
Runtime state is stored in `.omp/harness-state/` (project-local, gitignored).
Gates that emit a debug trace write it to `.omp/harness-state/hook-debug.log` **only when `HARNESS_DEBUG` is set to a non-empty value** (e.g. `HARNESS_DEBUG=1`); off by default, to avoid log noise. Not every gate logs there — `read-tracker`/`write-tracker` write only `read-log.txt`, and `kickoff-detector`/`harness-version-check` don't use it. Gate behavior — what blocks or allows — never depends on `HARNESS_DEBUG`.

## Required Gates and Event Wiring

The following controls are required when harness is available:

1. `context-gate` — blocks edits to unread files (`tool_call`: edit|write|ast_edit)
2. `read-tracker` — records file reads for context-gate (`tool_result`: read)
   - `write-tracker` — records files written for context-gate so a file created this session can be edited without re-reading (`tool_result`: edit|write|ast_edit)
3. `acceptance-gate` — blocks commits with unmet acceptance criteria (`tool_call`: bash, via commit-gates)
4. `backpressure-gate` — blocks commits if build/test/lint failed (`tool_call`: bash, via commit-gates)
5. `backpressure-tracker` — records build/test/lint successes (`tool_result`: bash, exit 0); `backpressure-failure-tracker` records failures (`tool_result`: bash with `isError` or non-zero `details.exitCode`)
6. `kickoff-detector` — reminds about kickoff for new work (`before_agent_start`, message injection)
7. `archive-guard` — blocks commits that would ingest local-archive files (`docs/sum`, `docs/reviews`, `docs/brainstorming`); warns on legacy-tracked ones (`tool_call`: bash, via commit-gates). The push-boundary backstop lives in `.githooks/pre-push` (blocks when archives are TRACKED) and the `compush`/`compr` pre-push checks; narrative backup is the private sum-vault (see `rules/doc_standards.md`).
8. Architect verification — independent completion verification (oh-my-claudecode agent, via OMP's task tool)

> The commit-only gates — `acceptance-gate`, `backpressure-gate`, `review-gate`, and `archive-guard` — are registered through a single dispatcher `commit-gates.mjs` (`tool_call`: bash). The extension imports `./gates/git-commit-detect.mjs` and runs one in-process `isGitCommit` check per bash command, only spawning the dispatcher on an actual commit (zero spawns on the common non-commit path). On a commit it runs all four in order and blocks if ANY blocks (each child gets a ~3s budget within the dispatcher's 15s; a gate that fails to run cleanly is skipped with a loud `HARNESS WARNING`). `destructive-guard` stays a separate `tool_call`: bash gate (it scans every command, not just commits).

> Scope drift is no longer gate-enforced (scope-gate retired). It is handled by the AGENTS.md "Surgical Changes" rule + PR review; `out_of_scope` in seed.yaml is advisory prose the agent reads.

> **Task closeout** (`docs/rules/closeout_contract.md`): when a kickoff'd task lands on main (`compr`/`compush`), it is closed out — `seed.yaml` → `status: done`, `current-scope.md` retired, `task_closed` audit event. This is the **trigger lane** (best-effort, agent-run). The **verification lane** is independent: `docs-drift` warns (never fails) on inconsistent closeout state (orphan scope / half-closed / closeout-pending) at pre-push, not trusting the trigger. The acceptance-gate honors closed seeds (`done`/`superseded` → no active AC) and a `wip:`/`[wip]` commit bypasses unmet AC for in-progress checkpoints.

## Auxiliary Gates and Orphan Detection

Not every `.mjs` in `.omp/extensions/harness/gates/` is invoked from `index.ts` via a direct `runGate(...)` call. Two groups are intentionally indirect:

- **Helper modules** (imported by other gates or by the extension, never spawned themselves): `git-commit-detect` (shared `isGitCommit` detector imported by `index.ts` and used by `commit-gates`, `acceptance-gate`, `backpressure-gate`, `review-gate`), `risk-assess` (risk classification imported by `review-gate` and `backpressure-gate`), `backpressure-patterns` (shared by `backpressure-tracker` and `backpressure-failure-tracker`), `read-path` (imported by `index.ts` — 라우팅·타깃 추출 순수 함수 층: `readTarget` strips a read selector / filters URLs so read-tracker logs the bare path context-gate compares against; `editTargets`/`mutationCallTargets` resolve mutating-call gate targets incl. the paths inside an `xd://ast_edit` dispatch body; `mutationRoute` classifies v17 xd:// device dispatches on `write` results — URI-scheme targets never enter the ledgers; `resolvedAstEditFiles` extracts the written files from an `xd://resolve` apply envelope).
- **Standalone advisory / lifecycle gates** (wired in `index.ts`, non-blocking): `destructive-guard` (`tool_call`: bash, scans every command), `mcp-gate` (advisory notice on `mcp__*` tool calls), `backpressure-invalidator` (`tool_result`: edit/write; for a staged `ast_edit` (v17 xd:// device dispatch) it runs on the PREVIEW as a safety fallback AND on the real `xd://resolve` apply — marks verification state stale), `harness-version-check` (`session_start` with the 24h default window; ALSO re-run agent-facing with a 1h `max_age_ms` window at `before_agent_start` — merged into the `harness-reminder` message — and after a successful `git commit` on `tool_result`, where drift text is appended to the commit's tool result. Failed probes write a short-lived failure marker so frequent callers back off instead of re-stalling on a dead network).

`scripts/docs-drift` audits this layout. Its orphan check is **reachability-based**: a gate is "live" if it is referenced from `.omp/extensions/harness/index.ts` (a `runGate(...)` call or import) **or** reachable from a referenced gate via an import / spawn reference (a quoted `*.mjs` literal that resolves to a real gate file). The delegated gates and the helper modules above are therefore live, not orphans. Only a gate that is unreferenced **and** unreachable from the extension entry point is flagged — so a genuinely dead file left after a refactor is still caught. docs-drift is wired into `.githooks/pre-push` and blocks a push on FAIL-severity drift (broken links, a reference doc that claims `status: synced` while stale, a wired gate whose file is missing); WARNING-severity issues such as a true orphan, or an inconsistent closeout state (orphan current-scope / half-closed / closeout-pending), do not block.

## Gate Verification Requirements

Use concrete checks, not assumptions.

### 1) `context-gate` + `read-tracker` + `write-tracker`

- Files: `.omp/extensions/harness/gates/context-gate.mjs`, `.omp/extensions/harness/gates/read-tracker.mjs`, `.omp/extensions/harness/gates/write-tracker.mjs`
- Log: `.omp/harness-state/hook-debug.log` (written only when `HARNESS_DEBUG` is set)
- State: `.omp/harness-state/read-log.txt` (appended by both `read-tracker` on read and `write-tracker` on edit|write)

### 2) `acceptance-gate`

- File: `.omp/extensions/harness/gates/acceptance-gate.mjs`
- Log: `.omp/harness-state/hook-debug.log` (written only when `HARNESS_DEBUG` is set)
- Reads: `docs/harness/current-scope.md` (checkboxes), `docs/harness/seed.yaml` (AC), `docs/harness/acceptance-done` (override flag)

### 3) `backpressure-gate` + `backpressure-tracker`

- Files: `.omp/extensions/harness/gates/backpressure-gate.mjs`, `.omp/extensions/harness/gates/backpressure-tracker.mjs`, `.omp/extensions/harness/gates/backpressure-failure-tracker.mjs`
- Log: `.omp/harness-state/hook-debug.log` (written only when `HARNESS_DEBUG` is set)
- State: `.omp/harness-state/backpressure-status`, `.omp/harness-state/test-history.json`
- **Failure recording**: the OMP adapter routes a failed bash `tool_result` to `backpressure-failure-tracker`, so failed build/test/lint runs ARE recorded — `backpressure-gate` sees explicit FAIL state, not just absence of recent success. Failure means `isError: true` OR non-zero `details.exitCode` (OMP keeps `isError` false for non-zero command exits and reports the code in `details.exitCode`; verified empirically). Residual dependence: a failing command that still exits 0 (a runner that swallows the exit code) is recorded as success.

### 4) `kickoff-detector`

- File: `.omp/extensions/harness/gates/kickoff-detector.mjs`
- Reads: `docs/harness/kickoff-done` (suppresses reminder if exists)

### 5) Architect verification + Completion Attack Gate

- Provided by oh-my-claudecode `architect` agent (discovered via OMP's task tool)
- Not a file gate — invoked via agent delegation
- **Async delegation**: the `task` spawn is non-blocking — verdicts arrive via async job delivery. Spawning a verification agent (architect/verifier/reviewer) is **not** completion; the main agent MUST receive the verdict before claiming the task done.
- **Extended by completion-attack gate** (see [`rules/adversarial_review.md`](adversarial_review.md)):
  - architect (기존 역할 유지) + security-reviewer + test-engineer 병렬 실행
  - 불일치 시 critic이 합의 판정
  - CRITICAL 발견 시 블로킹
- Output: `docs/harness/completion-attack-report.md`

## Startup Checklist (Run Before Claiming Compliance)

1. Confirm gates directory exists: `test -d .omp/extensions/harness/gates && echo gates_ok`
2. Confirm all gate files are present:
   ```bash
   for h in context-gate read-tracker write-tracker commit-gates acceptance-gate backpressure-gate review-gate archive-guard backpressure-tracker kickoff-detector; do
     test -f ".omp/extensions/harness/gates/$h.mjs" && echo "$h: ok" || echo "$h: MISSING"
   done
   ```
3. Confirm the extension wires the gates: `grep -c 'runGate(' .omp/extensions/harness/index.ts` (non-zero; the exact count grows as gates are added — do not assert a constant). Both this AND step 2 must pass — wiring without files, or files without wiring, is a failure.
4. Confirm Architect agent is available via oh-my-claudecode (OMP task tool)
5. Record harness status in your working notes and final PR report

## Fallback Behavior When a Gate Is Unavailable

If any required gate is unavailable, do not claim fully automated harness compliance for that gate. Apply this downgrade policy:

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
| Gate file not found in `.omp/extensions/harness/gates/` | Partial clone or deleted gate file | Re-clone template or restore from git; if blocked, activate manual checklist downgrade |
| Gate exists but no events in `.omp/harness-state/hook-debug.log` | Debug logging is OFF by default (gated behind `HARNESS_DEBUG`) | An empty/absent log does NOT mean the gate is unwired. Set `HARNESS_DEBUG=1` to enable logging, then verify the `runGate(...)` reference in `.omp/extensions/harness/index.ts` and re-run a benign trigger. |
| `acceptance-gate` repeatedly blocks completion | Missing evidence or unchecked AC in `current-scope.md` | Check off completed criteria or create `docs/harness/acceptance-done` override |
| `backpressure-gate` loops on failures | Underlying failing test/check never addressed | Stop retries, fix root cause, then re-run once with documented rationale |
| `context-gate` blocks unexpectedly | `read-log.txt` missing or stale | Read the file first; if persistent, check `read-tracker` is wired in `.omp/extensions/harness/index.ts` |
| Architect log missing for completed task | oh-my-claudecode not installed or architect agent unavailable | Run manual two-pass verification and mark Architect as downgraded in report |

## Copy-Paste Verification Template

Use this in PR descriptions or completion reports:

```md
### Harness Verification
- context-gate: [active | unavailable->manual] (evidence: `<command/log snippet>`)
- acceptance-gate: [active | unavailable->manual] (evidence: `<command/log snippet>`)
- backpressure-gate: [active | unavailable->manual] (evidence: `<command/log snippet>`)
- Architect verification: [active | unavailable->manual] (evidence: `<command/log snippet>`)

### Downgrades (if any)
- Gate: `<name>`
- Manual checklist used: `<checklist/steps>`
- Residual risk: `<brief note>`
```
