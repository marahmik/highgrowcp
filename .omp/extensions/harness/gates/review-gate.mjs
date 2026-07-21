#!/usr/bin/env node
// review-gate.mjs - PreToolUse hook for Bash (git commit)
// Purpose: Enforce review based on change risk level
// - critical/high risk + no review → BLOCK
// - critical/high risk + FAIL review → BLOCK
// - medium risk + no review → WARNING (recommend reviewer)
// - low risk → PASS (docs/config don't need adversarial review)
// Exit 0 = allow, Exit 2 = block

import { readFileSync, existsSync, appendFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { assessRisk } from './risk-assess.mjs';
import { isGitCommit, parseCommitForm } from './git-commit-detect.mjs';

function getStateDir(cwd) {
  const dir = join(cwd, '.omp', 'harness-state');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

// Decide whether today's reviews cover the current diff and whether any covering
// review is a FAIL. `reviews` is [{ name, content }]; `currentHash` is the
// effective committed-diff hash (or null when it could not be produced).
// - A review "covers" the diff when it carries the hash in a `diff-hash` FIELD at
//   the start of a line (optionally behind Markdown list/quote/bold markers), e.g.
//   "diff-hash: <h>" or "diff-hash (initial review): <h>" or "- **diff-hash: <h>**".
//   A bare hash in prose, or a different field like "previous-diff-hash:", does NOT
//   count — the field must begin the line so it asserts coverage, not just mention it.
// - ALL of today's reviews are scanned (not just the lexicographically-last one),
//   so several PRs landing the same day don't shadow each other.
// - FAIL blocks only when it covers the current diff; if the hash is unknown we
//   fall back to any of today's reviews so an explicit FAIL still blocks.
// - matchedCurrent is true/false when a hash exists, or null when it could not be
//   computed (the gate treats null as "unverified" and fails closed on high/critical).
// Map a token to a model FAMILY, or null if it is not a single clean model name. The token must be
// ENTIRELY `[provider/]<alias><version-suffix?>` — the alias is a known model word, optionally followed
// by a version that starts with `-`/`.`/digit. This rejects substrings ("octopus"!="opus", "gptscript",
// "bardic") and trailing-word phrases ("codex skipped", "no codex") — only a bare model name maps.
// Codex folds into the gpt (OpenAI) family, so "codex, gpt-5" is ONE family, while "claude, codex" is two.
function modelFamily(tok) {
  const e = String(tok).toLowerCase().trim().replace(/^[a-z][a-z0-9.-]*\//, ''); // drop one provider/ prefix
  const m = e.match(/^(claude|sonnet|opus|haiku|codex|gpt|o[1-9]|gemini|bard|grok|llama|mistral|mixtral|deepseek|qwen)(?:[-.\d][a-z0-9.-]*)?$/);
  if (!m) return null;
  const a = m[1];
  if (/^(?:claude|sonnet|opus|haiku)$/.test(a)) return 'claude';
  if (/^(?:codex|gpt|o[1-9])$/.test(a)) return 'gpt';
  if (/^(?:gemini|bard)$/.test(a)) return 'gemini';
  return a; // grok | llama | mistral | mixtral | deepseek | qwen
}

// Heterogeneity evidence for a HIGH/CRITICAL review (continuous-cross-review policy). Accepts EITHER a
// `codex-thread:`/`codex-session:`/`adversary-thread:` field whose value's FIRST token is a real id
// (>=8 leading hex, optionally `-hex` groups), OR a `models`/`models-*` field where EVERY token is a
// clean model name (see modelFamily) AND >=2 DISTINCT families are named. A single stray non-model
// token (noise, a negated "no codex"/"codex skipped", a bare provider) makes the whole list not count.
// Markdown emphasis, list/quote/numbered prefixes, CRLF, and HTML comments are tolerated. The gate
// enforces that real evidence is PRESENT; truthfulness of the declaration is the reviewer contract's job.
function isHetEvidence(content) {
  for (const raw of String(content).split(/\r?\n/)) {
    const m = /^[ \t>*-]*(?:\d+[.)][ \t]*)?\*{0,2}([a-z][a-z-]*)\*{0,2}[ \t]*:\*{0,2}[ \t]*(.*)$/i.exec(raw);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].replace(/<!--[\s\S]*?-->/g, '').replace(/[*`]/g, '').trim();
    if (!val) continue;
    if (/^(?:codex|adversary)-(?:thread|session)$/.test(key)) {
      const id = val.split(/\s+/)[0];
      if (/^[0-9a-f]{8,}(?:-[0-9a-f]+)*$/i.test(id)) return true; // real id shape, not "----deadbeef"
    } else if (/^models(?:[-_]|$)/.test(key)) {
      const toks = val.split(/[,&+/]|\s+/).map((s) => s.trim()).filter(Boolean);
      if (toks.length < 2) continue;
      const fams = new Set();
      let allModels = true;
      for (const tok of toks) { const f = modelFamily(tok); if (!f) { allModels = false; break; } fams.add(f); }
      if (allModels && fams.size >= 2) return true;
    }
  }
  return false;
}

function evaluateReviews(reviews, currentHash) {
  // ^ + optional "[ \t>*-]" markers + word-bounded "diff-hash" field + the hash.
  const covers = currentHash
    ? (content) => new RegExp(`^[ \\t>*-]*diff-hash\\b[^\\n:]*:[ \\t]*${currentHash}\\b`, 'm').test(content)
    : () => false;
  // Heterogeneity is detected by isHetEvidence() (family-counting parser, above): a single-model or
  // placeholder-field review does not satisfy it.
  const matching = currentHash ? reviews.filter((r) => covers(r.content)) : [];
  const failScope = matching.length > 0 ? matching : (currentHash ? [] : reviews);
  const hasFail = failScope.some((r) => /Verdict:\s*FAIL/i.test(r.content));
  const matchedCurrent = currentHash ? matching.length > 0 : null;
  const matchedHet = currentHash ? matching.some((r) => isHetEvidence(r.content)) : null;
  return { hasFail, matchedCurrent, matchedHet };
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
  appendFileSync(logFile, `[${timestamp}] review-gate: ${msg}\n`);
}

log('Hook started');

const command = data?.tool_input?.command || '';

if (!isGitCommit(command)) {
  log('Not a git commit, allowing');
  process.exit(0);
}

// Parse the commit form ONCE: it scopes both the risk assessment (assess only what the
// commit captures, not unrelated unstaged changes) and the effective-diff hash below.
const form = parseCommitForm(command);
const risk = assessRisk(cwd, form);
log(`Risk: ${risk.level} (${risk.reason}), ${risk.files.length} files, ~${risk.diffSize} lines`);

if (risk.level === 'low' || risk.level === 'none') {
  log('Low/no risk, review not required');
  process.exit(0);
}

const reviewDir = join(cwd, 'docs', 'reviews');
const skipFile = join(cwd, 'docs', 'harness', 'review-skip');

if (existsSync(skipFile)) {
  log('review-skip flag found, allowing');
  unlinkSync(skipFile);
  process.exit(0);
}

// LOCAL date (not toISOString's UTC): reviewer docs are named by the author's local
// date, so a UTC "today" mismatched real reviews between local midnight and the UTC
// offset (e.g. 00:00–08:59 KST → still "yesterday" in UTC), falsely failing coverage.
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
let todayReviews = [];

if (existsSync(reviewDir)) {
  todayReviews = readdirSync(reviewDir).filter(f => f.startsWith(`review-${today}`));
}

if (todayReviews.length === 0) {
  if (risk.level === 'critical' || risk.level === 'high') {
    log(`BLOCKED: ${risk.level} risk with no review`);
    console.error(`HARNESS BLOCK: ${risk.level} risk changes (${risk.reason}) require review.`);
    console.error('Run reviewer agent first, or create docs/harness/review-skip to override.');
    process.exit(2);
  }
  log(`WARNING: ${risk.level} risk with no review`);
  console.error(`HARNESS WARNING: ${risk.level} risk changes without review. Consider running reviewer agent.`);
  process.exit(0);
}

// Hash the EFFECTIVE committed diff, then correlate it against today's reviews.
// parseCommitForm tells us which diff the commit will capture:
//   all=true (-a/--all) -> all tracked changes  (git diff HEAD)
//   else (plain)        -> the staged index     (git diff --cached)
// This closes the gap where `git commit -a` pulled in tracked changes the staged-diff
// hash never saw, letting a stale PASS review match the wrong content. Every other
// form (pathspec, --amend, --include/-i, -p, --pathspec-from-file, a commit behind
// bash -c, >1 commit in one line, or a repo-redirecting global like -C) is UNVERIFIABLE:
// currentHash stays null and the gate fails closed on high/critical (see the
// matchedCurrent !== true branch below). execSync runs through a shell, so the pipe
// needs no `shell` option; both diff commands are constant (no user input on the line).
let currentHash = null;
if (form.verifiable) {
  const diffCmd = form.all ? 'git diff HEAD' : 'git diff --cached';
  try {
    currentHash = execSync(`${diffCmd} | shasum -a 256`, { cwd, encoding: 'utf-8' }).trim().split(/\s+/)[0];
  } catch {
    currentHash = null;
  }
}

const reviews = todayReviews.map((f) => {
  try {
    return { name: f, content: readFileSync(join(reviewDir, f), 'utf-8') };
  } catch {
    return { name: f, content: '' };
  }
});

const { hasFail, matchedCurrent, matchedHet } = evaluateReviews(reviews, currentHash);

// A FAIL verdict covering the current diff blocks regardless of risk level.
if (hasFail) {
  log('BLOCKED: a review verdict is FAIL for the current changes');
  console.error('HARNESS BLOCK: a review verdict is FAIL for the current changes. Fix issues before committing.');
  process.exit(2);
}

// A review must positively cover this diff. matchedCurrent === true means a today
// review carries the current diff hash. Both false (no match) and null (hash could
// not be computed) mean "unverified" — high/critical fails closed, matching the
// harness's fail-closed-on-unknown stance (cf. backpressure-gate). review-skip
// (handled above) is the deliberate escape hatch.
if (matchedCurrent !== true) {
  const detail = currentHash
    ? 'no review matches the current changes'
    : (form.verifiable
        ? 'could not compute the diff hash (git/shasum error)'
        : 'the commit form is unverifiable (an output redirection like `2>&1`, a compound `&&`/`;` line, a pathspec, --amend, or -a with unstaged changes) — run a STANDALONE `git commit` (no trailing `2>&1`/`; …`, no `cd … &&` prefix) so the staged diff can be hashed');
  if (risk.level === 'critical' || risk.level === 'high') {
    log(`BLOCKED: ${detail}`);
    console.error(`HARNESS BLOCK: ${detail}. Re-run reviewer agent, or create docs/harness/review-skip to override.`);
    process.exit(2);
  }
  log(`WARNING: ${detail}`);
  console.error(`HARNESS WARNING: ${detail}. Consider re-running reviewer.`);
}

// Heterogeneity enforcement: a covering review for a HIGH/CRITICAL change must evidence a
// heterogeneous (>=2 model families, e.g. a codex pass) review. A single-model review covering the
// diff is treated as not-yet-reviewed for risky changes. (Medium keeps review optional, so it is not
// subject to this; review-skip remains the deliberate override.)
if (matchedCurrent === true && matchedHet !== true && (risk.level === 'critical' || risk.level === 'high')) {
  log('BLOCKED: covering review shows no heterogeneous-review evidence');
  console.error('HARNESS BLOCK: the review covering these changes is single-model — a HIGH/CRITICAL change needs a HETEROGENEOUS review (>=2 model families / a codex pass). After running the heterogeneous pass, add a `models:` (>=2 entries) or `codex-thread:` field to the review doc, or create docs/harness/review-skip to override.');
  process.exit(2);
}

log(`Review check passed (${todayReviews.length} today, matchedCurrent=${matchedCurrent})`);
process.exit(0);
