#!/usr/bin/env node
// acceptance-gate.mjs - PreToolUse hook for Bash(git commit*)
// Purpose: Block commits if acceptance criteria not met
// Logic: Pass if (all checkboxes checked) OR (acceptance-done flag exists)
// Exit 0 = allow, Exit 2 = block (uses stderr for messages)

import { readFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { isGitCommit, isWipCommit, parseCommitForm } from './git-commit-detect.mjs';
import { assessRisk } from './risk-assess.mjs';

// Use project-local state directory
function getStateDir(cwd) {
  const dir = join(cwd, '.omp', 'harness-state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

const input = readFileSync(0, 'utf-8');

let data;
try {
  data = JSON.parse(input);
} catch (e) {
  console.error('HARNESS WARNING: Hook received invalid input, skipping check.');
  process.exit(0);
}

const cwd = data?.session_state?.cwd || process.cwd();
const stateDir = getStateDir(cwd);
const logFile = join(stateDir, 'hook-debug.log');

function log(msg) {
  if (!process.env.HARNESS_DEBUG) return;
  const timestamp = new Date().toISOString();
  appendFileSync(logFile, `[${timestamp}] acceptance-gate: ${msg}\n`);
}

log('Hook started');

const command = data?.tool_input?.command || '';
log(`Command: ${command}`);

// Only check for git commit commands
if (!isGitCommit(command)) {
  log('Not a git commit, allowing');
  process.exit(0);
}

log('Git commit detected, checking acceptance criteria');
log(`CWD: ${cwd}`);

// Support test mode with custom paths
const isTestMode = process.env.ACCEPTANCE_GATE_TEST === 'true';
const scopeFilePath = isTestMode
  ? process.env.TEST_SCOPE_FILE
  : join(cwd, 'docs', 'harness', 'current-scope.md');
const flagFilePath = isTestMode
  ? process.env.TEST_FLAG_FILE
  : join(cwd, 'docs', 'harness', 'acceptance-done');
const seedPath = isTestMode
  ? process.env.TEST_SEED_FILE
  : join(cwd, 'docs', 'harness', 'seed.yaml');

// L2 backstop (analysis Q6.2 / seed AC6): when a commit reaches a "no active acceptance
// criteria" allow-path (closed/empty seed, or seed-with-AC but no current-scope), a CODE
// change must not pass silently — surface it so the iteration (P2) gets a thread-scope.
// Doc/config-only commits (risk=low) and WIP/override pass unchanged. Risk can't be assessed
// without git (tests, detached): fail OPEN (unknown -> allow) so the backstop never blocks
// blindly and the existing active-seed gating is untouched.
function backstop(reason, opts = {}) {
  let level;
  if (process.env.TEST_RISK_LEVEL) {
    level = process.env.TEST_RISK_LEVEL;        // test seam: deterministic risk without a git repo
  } else {
    // Scope risk to the diff the commit actually captures (--cached for plain, HEAD for -a),
    // not the staged∪unstaged union — unrelated unstaged code must not over-count a docs commit.
    try { level = assessRisk(cwd, parseCommitForm(command)).level; } catch { level = 'unknown'; }
  }
  const codeTouching = level === 'medium' || level === 'high' || level === 'critical';
  if (!codeTouching) {
    log(`backstop(${reason}): risk=${level} not code-touching -> allow`);
    process.exit(0);
  }
  if (isWipCommit(command)) {
    log(`backstop(${reason}): wip marker -> allow`);
    process.exit(0);
  }
  log(`BACKSTOP BLOCK: code change with no active AC (${reason}), risk=${level}`);
  console.error('HARNESS BACKSTOP: 코드 변경인데 이를 추적할 active acceptance criteria가 없습니다.');
  console.error(`  reason: ${reason}`);
  console.error('  반복(P2) 작업이 충실도 추적 없이 커밋되려 합니다. 다음 중 하나:');
  if (opts.closed) {
    console.error('  1. 같은 기능 반복이면 seed 재개(reopen): node .omp/extensions/harness/thread-scope.mjs open');
    console.error('     (genuinely 새 기능이면 /kickoff로 새 seed)');
  } else {
    console.error('  1. thread-scope 열기: node .omp/extensions/harness/thread-scope.mjs open');
  }
  console.error('  2. trivial이면 `wip:` 커밋, 또는 docs/harness/acceptance-done 생성(override)');
  process.exit(2);
}

// Check 1: Flag file exists (manual override)
if (existsSync(flagFilePath)) {
  log('acceptance-done flag exists, allowing (manual override)');
  process.exit(0);
}

// Check 2: seed.yaml AC existence check
if (existsSync(seedPath)) {
  let seedContent;
  try { seedContent = readFileSync(seedPath, 'utf-8'); }
  catch { log('seed.yaml read failed (race), allowing'); process.exit(0); }
  // A CLOSED seed carries no ACTIVE acceptance criteria: `done` = the task completed
  // (closeout), `superseded` = replaced by a newer seed. Either way its criteria belong
  // to a finished/obsolete task and must not gate new, unrelated work. (cf. seed_contract.md)
  const statusMatch = seedContent.match(/^status:\s*["']?(\w+)/m);  // tolerate quoted YAML
  const status = statusMatch ? statusMatch[1].toLowerCase() : null;
  if (status === 'done' || status === 'superseded') {
    log(`seed.yaml status=${status} (closed), no active AC, allowing`);
    backstop(`closed seed (status:${status})`, { closed: true });
  }
  const hasAC = /^acceptance_criteria:\s*\n\s+-/m.test(seedContent);
  if (hasAC) {
    log('AC found in seed.yaml, checking completion via flag or scope file checkboxes');
  } else {
    log('seed.yaml exists but no AC defined, allowing with warning');
    console.error('HARNESS WARNING: seed.yaml has no acceptance_criteria. Run /kickoff to define them.');
    backstop('seed has no acceptance_criteria');
  }
}

// Check 3: Scope file exists (checkbox-based completion tracking)
if (!existsSync(scopeFilePath)) {
  if (existsSync(seedPath)) {
    log('seed.yaml has AC but no current-scope.md for checkbox tracking, allowing with warning');
    console.error('HARNESS WARNING: AC defined in seed.yaml but no current-scope.md for completion tracking.');
    backstop('seed defines AC but no current-scope.md');
  }
  log('No current-scope.md found, allowing with warning');
  console.error('HARNESS WARNING: No scope file. Run /kickoff to define acceptance criteria.');
  process.exit(0);
}

// Read scope file
let scopeContent;
try { scopeContent = readFileSync(scopeFilePath, 'utf-8'); }
catch { log('current-scope.md read failed (race), allowing'); process.exit(0); }

// Extract Acceptance Criteria section
const acceptanceMatch = scopeContent.match(/## Acceptance Criteria\s*\n([\s\S]*?)(?=\n##|\n*$)/i);
if (!acceptanceMatch) {
  log('No Acceptance Criteria section found, allowing with warning');
  console.error('HARNESS WARNING: No Acceptance Criteria section in scope file.');
  process.exit(0);
}

const acceptanceSection = acceptanceMatch[1];

// Find all checkboxes
const checkboxes = acceptanceSection.match(/- \[[ x]\]/g) || [];
const checked = acceptanceSection.match(/- \[x\]/gi) || [];
const unchecked = acceptanceSection.match(/- \[ \]/g) || [];

log(`Checkboxes: total=${checkboxes.length}, checked=${checked.length}, unchecked=${unchecked.length}`);

if (checkboxes.length === 0) {
  log('No checkboxes defined, allowing');
  backstop('current-scope has no acceptance-criteria checkboxes');
}

if (unchecked.length === 0) {
  log('All acceptance criteria met, allowing');
  process.exit(0);
}

// WIP commits are intentional in-progress checkpoints. Without this, every commit
// during a tracked task is blocked until ALL AC are checked, pushing people to the
// blunt `acceptance-done` flag (which disables the gate). A `wip:`/`[wip]` marker in
// the message lets intermediate commits through while keeping the gate armed for the
// real (non-WIP) commit. (cf. closeout_contract.md — closeout runs on completion.)
if (isWipCommit(command)) {
  log(`WIP commit, ${unchecked.length} unchecked criteria but allowing (wip marker)`);
  console.error(`HARNESS WARNING: WIP commit with ${unchecked.length} unmet acceptance criteria (allowed by wip marker).`);
  process.exit(0);
}

// Unchecked items exist and no flag file = block
log(`BLOCKED: ${unchecked.length} unchecked criteria, no override flag`);

const uncheckedItems = [];
const lines = acceptanceSection.split('\n');
for (const line of lines) {
  if (line.match(/- \[ \]/)) {
    uncheckedItems.push(line.replace(/- \[ \]/, '').trim());
  }
}

console.error(`HARNESS BLOCK: Cannot commit. ${unchecked.length} acceptance criteria not met:`);
uncheckedItems.slice(0, 3).forEach(item => console.error(`  - [ ] ${item}`));
if (uncheckedItems.length > 3) {
  console.error(`  ... and ${uncheckedItems.length - 3} more`);
}
console.error('');
console.error('Options:');
console.error('  1. Check off completed criteria in docs/harness/current-scope.md');
console.error('  2. Create docs/harness/acceptance-done to override');

process.exit(2);
