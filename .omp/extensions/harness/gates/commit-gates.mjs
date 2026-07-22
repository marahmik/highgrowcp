#!/usr/bin/env node
// commit-gates.mjs - single PreToolUse:Bash dispatcher for the commit-only gates.
//
// Replaces three separate hook registrations (acceptance-gate, backpressure-gate, review-gate) with
// ONE. The overwhelming majority of Bash commands are not commits, so this performs the single
// isGitCommit check and exits — one node spawn per non-commit Bash instead of three (audit item #8b).
//
// On an actual `git commit` it runs ALL registered gates, in registration order, feeding each the
// same stdin. It runs all of them (rather than stopping at the first block) so that every gate
// evaluates and consumes its own one-shot skip flag deterministically, and all warnings surface in a
// single pass — matching an all-hooks-run model. The commit is blocked (exit 2) if ANY gate blocks. A gate that
// does not exit cleanly (crash / timeout / spawn failure) is treated as non-blocking — a broken gate
// must not block commits, matching the prior per-hook fail-open behavior — but it is logged loudly so
// a silently-removed or hung gate is observable. The gates are unchanged and still independently
// runnable; this only unifies their registration. destructive-guard stays a SEPARATE hook — it scans
// every command, not just commits, so it must keep running on non-commit Bash too.

import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { isGitCommit } from './git-commit-detect.mjs';

const raw = readFileSync(0, 'utf-8');

let data;
try {
  data = JSON.parse(raw);
} catch {
  console.error('HARNESS WARNING: Hook received invalid input, skipping check.');
  process.exit(0);
}

const command = data?.tool_input?.command || '';

// The one cheap check for the common case. Not a commit -> nothing to gate, single spawn done.
if (!isGitCommit(command)) process.exit(0);

const here = dirname(fileURLToPath(import.meta.url));
const GATES = ['acceptance-gate.mjs', 'backpressure-gate.mjs', 'review-gate.mjs', 'archive-guard.mjs'];

// Each child gets its own ~3s budget (matching the old per-gate timeout) so one slow/hung gate can't
// starve the others or blow the dispatcher's outer budget; the harness extension (index.ts) gives the
// dispatcher 15s (COMMIT_GATES_TIMEOUT_MS) to cover the four sequential runs.
const CHILD_TIMEOUT_MS = 3000;

let blocked = false;
for (const gate of GATES) {
  const r = spawnSync(process.execPath, [join(here, gate)], {
    input: raw,
    encoding: 'utf-8',
    timeout: CHILD_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status === 2) {
    blocked = true;
  } else if (r.status !== 0) {
    // crash (non-zero), timeout (status null + ETIMEDOUT), or spawn failure — fail open, but loudly.
    const why = r.error ? r.error.code || r.error.message : `exit ${r.status}`;
    console.error(`HARNESS WARNING: commit gate '${gate}' did not run cleanly (${why}); skipping it.`);
  }
}

process.exit(blocked ? 2 : 0);
