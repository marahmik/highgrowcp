#!/usr/bin/env node
// breadcrumb-tracker.mjs - tool_result hook (Bash | Write/Edit)
// Purpose (seed AC1, analysis Q1.5): append a low-cost, NO-LLM session breadcrumb so a
// later session (or a manual `sum`) can resume from "what happened" without re-deriving it.
// Records only signal-rich events — commits, verification PASS/FAIL, file edits — to an
// append-only `.omp/harness-state/session-log.jsonl`. Mirrors backpressure-tracker.
//
// This is NOT a blocking gate: it always exits 0. It records facts, never judges.

import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { join, relative, basename } from 'path';
import { isGitCommit } from './git-commit-detect.mjs';
import { classifyVerification } from './backpressure-patterns.mjs';

let data;
try {
  data = JSON.parse(readFileSync(0, 'utf-8'));
} catch {
  process.exit(0); // never block on bad input
}

const cwd = data?.session_state?.cwd || process.cwd();
const tool = data?.tool_name || '';
const input = data?.tool_input || {};

// Build the breadcrumb entry for this tool result (null = nothing worth recording).
function entry() {
  if (tool === 'Bash') {
    const command = String(input.command || '');
    if (!command) return null;
    if (isGitCommit(command)) {
      const cmd = command.slice(0, 80);
      if (input.failed) return { kind: 'commit', result: 'FAIL', cmd };
      let hash;
      try { hash = execSync('git rev-parse --short HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch {}
      return { kind: 'commit', hash, cmd };
    }
    const { isVerification, type } = classifyVerification(command);
    if (isVerification) {
      // index.ts passes the bash failure signal through tool_input.failed.
      return { kind: 'test', type, result: input.failed ? 'FAIL' : 'PASS' };
    }
    return null; // ordinary bash (ls/cat/...) is noise — skip
  }
  if (tool === 'Write' || tool === 'Edit') {
    const fp = String(input.file_path || '');
    if (!fp) return null;
    let rel = fp;
    try { rel = relative(cwd, fp) || fp; } catch {}
    // an edit to the live scope file is an AC-toggle proxy (Q1.5 "AC 토글")
    const kind = basename(rel) === 'current-scope.md' ? 'scope' : 'edit';
    return { kind, file: rel };
  }
  return null;
}

const e = entry();
if (e) {
  try {
    const stateDir = join(cwd, '.omp', 'harness-state');
    if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n';
    appendFileSync(join(stateDir, 'session-log.jsonl'), line);
  } catch { /* best-effort: a breadcrumb is advisory; never block on FS errors */ }
}

process.exit(0);
