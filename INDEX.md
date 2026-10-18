# INDEX.md (SSalcheduler app + layered agent harness)

This repository contains the 쌀체듈러 (SSalcheduler) store-staff scheduling app and a layered agent policy set (entry + modules + checklists + templates).

**Designed for**: Oh My Pi (OMP) environment (harness gates wired by the OMP extension `.omp/extensions/harness/index.ts`; OMC agents available via OMP's task tool).

## Quick Reference

- Principles & examples: [`EXAMPLES.md`](EXAMPLES.md)

## Entry points

- App overview, setup prerequisites and development checks: [`README.md`](README.md)
- Scheduling-app context and constraints: [`claudedocs/project_instructions.md`](claudedocs/project_instructions.md)

- Agent policy (English): [`AGENTS.md`](AGENTS.md)
- Agent policy (Korean mirror, reference only, marked stale): [`claudedocs/CLAUDEKR.md`](claudedocs/CLAUDEKR.md)
- Original long-form candidate (verbatim, reference only): [`claudedocs/CLAUDE_original.md`](claudedocs/CLAUDE_original.md)
- Bootstrap guide (legacy, see `/skill:bootstrap`): [`claudedocs/bootstrap_oh_my_claudecode.md`](claudedocs/bootstrap_oh_my_claudecode.md)

## Policy sync process

Run policy sync whenever `AGENTS.md` changes (same PR) and refresh both reference docs or explicitly mark them stale.

- Checklist: [`templates/policy_sync_checklist.md`](templates/policy_sync_checklist.md)
- References to sync:
  - [`claudedocs/CLAUDEKR.md`](claudedocs/CLAUDEKR.md)
  - [`claudedocs/CLAUDE_original.md`](claudedocs/CLAUDE_original.md)

## Navigation

- Rules: [`rules/INDEX.md`](rules/INDEX.md)
- Checklists: [`checklists/INDEX.md`](checklists/INDEX.md)
- Templates: [`templates/INDEX.md`](templates/INDEX.md)
- Project-specific examples: [`claudedocs/INDEX.md`](claudedocs/INDEX.md)
- Agreements / notes (not SST, for humans): [`claudedocs/agreements.md`](claudedocs/agreements.md)


