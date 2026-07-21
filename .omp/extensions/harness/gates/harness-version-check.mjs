#!/usr/bin/env node
// harness-version-check.mjs - drift probe (SessionStart + turn-start reminder + post-commit recheck)
// Purpose: Notify when local harness is behind the source remote, and TELL the
// agent to resolve it via /skill:harness-check (resolution beats reporting).
//
// Skip logic: if harness-meta.json has no `source_remote`, this IS the source
// repo. Consumer projects get `source_remote` + `commit_sha` written by the
// bootstrap skill.
//
// Version compare: primary = tag name (harness/YYYY.N), fallback = commit SHA.
// Cache: .omp/state/harness-version-check.json — 24h default window; callers may
// pass a smaller `max_age_ms` in the stdin payload (turn-start/commit rechecks use
// 1h). Failed probes write a short-lived marker (FAILURE_TTL_MS) so per-turn
// callers never re-stall on a dead network every invocation.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_TTL_MS = 10 * 60 * 1000;

let stdin = '';
try { stdin = readFileSync(0, 'utf-8'); } catch { /* no stdin is fine */ }
let data = {};
try { data = JSON.parse(stdin); } catch { /* ignore */ }

const force = process.argv.includes('--force');
const cwd = data?.session_state?.cwd || process.cwd();

// Freshness window: stdin payload `max_age_ms` overrides the 24h default (0 = always refetch).
const rawMaxAge = data?.max_age_ms;
const maxAgeMs = typeof rawMaxAge === 'number' && Number.isFinite(rawMaxAge) && rawMaxAge >= 0 ? rawMaxAge : CACHE_TTL_MS;

// Log rotation: rotate hook-debug.log if it exceeds 1MB
const debugLogPath = join(cwd, '.omp', 'harness-state', 'hook-debug.log');
try {
  if (existsSync(debugLogPath) && statSync(debugLogPath).size > 1048576) {
    renameSync(debugLogPath, debugLogPath + '.old');
  }
} catch { /* ignore rotation errors */ }

const metaPath = join(cwd, '.omp/extensions/harness/harness-meta.json');
if (!existsSync(metaPath)) process.exit(0);

let meta;
try { meta = JSON.parse(readFileSync(metaPath, 'utf-8')); } catch { process.exit(0); }

const sourceRemote = meta.source_remote;
if (!sourceRemote) process.exit(0);

const cachePath = join(cwd, '.omp/state/harness-version-check.json');
const now = Date.now();

if (!force && existsSync(cachePath)) {
  try {
    const cached = JSON.parse(readFileSync(cachePath, 'utf-8'));
    const window = cached.failed ? FAILURE_TTL_MS : maxAgeMs;
    if (cached.checkedAt && (now - cached.checkedAt) < window) {
      // A failure marker preserves the last-known remote info (below) — a KNOWN drift
      // keeps being reported through failure windows instead of going silent for
      // FAILURE_TTL_MS; only the re-probe is backed off.
      if (cached.remoteLatestVersion) emitIfDrift(meta, cached);
      process.exit(0);
    }
  } catch { /* stale/corrupt cache — refetch */ }
}

let remote;
try {
  const output = execFileSync(
    'git',
    ['ls-remote', '--tags', sourceRemote, 'refs/tags/harness/*'],
    { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10000 },
  );
  remote = parseRemoteTags(output);
} catch {
  // Network/auth failure: record a short-lived failure marker so frequent callers
  // (turn-start recheck) back off instead of stalling on ls-remote every time.
  // Carry over the previous cache's remote fields — never clobber last-known-good
  // drift data with a bare marker — and still EMIT a known drift on this very call:
  // a failed probe must never silence a directive we already know applies.
  let keep = {};
  try {
    const prev = JSON.parse(readFileSync(cachePath, 'utf-8'));
    if (prev && typeof prev === 'object') keep = prev;
  } catch { /* no prior cache */ }
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    writeFileSync(cachePath, JSON.stringify({ ...keep, checkedAt: now, failed: true, source: sourceRemote }, null, 2));
  } catch { /* ignore cache write failure */ }
  if (keep.remoteLatestVersion) emitIfDrift(meta, keep);
  process.exit(0);
}

if (!remote?.remoteLatestVersion) process.exit(0);

try {
  mkdirSync(dirname(cachePath), { recursive: true });
  writeFileSync(cachePath, JSON.stringify({
    checkedAt: now,
    remoteLatestVersion: remote.remoteLatestVersion,
    remoteLatestSha: remote.remoteLatestSha,
    source: sourceRemote,
  }, null, 2));
} catch { /* ignore cache write failure */ }

emitIfDrift(meta, remote);
process.exit(0);

function parseRemoteTags(output) {
  const re = /^([0-9a-f]{40})\s+refs\/tags\/harness\/(\d{4})\.(\d+)(\^\{\})?$/gm;
  let best = null;
  let m;
  while ((m = re.exec(output)) !== null) {
    const [, sha, yr, seq, caret] = m;
    const rank = (+yr) * 1e6 + (+seq);
    const peeled = Boolean(caret);
    // Annotated tags list the tag-object line before the peeled `^{}` line; prefer the
    // peeled COMMIT sha on equal rank — harness-sync stores `rev-parse HEAD` (a commit
    // sha) in meta, so comparing against the tag-object sha would report drift forever.
    if (!best || rank > best.rank || (rank === best.rank && peeled && !best.peeled)) {
      best = { rank, version: `${yr}.${seq}`, sha, peeled };
    }
  }
  return best ? { remoteLatestVersion: best.version, remoteLatestSha: best.sha } : null;
}

function versionRank(v) {
  const m = /^(\d{4})\.(\d+)$/.exec(v || '');
  return m ? (+m[1]) * 1e6 + (+m[2]) : -1;
}

function emitIfDrift(localMeta, remoteInfo) {
  const lv = localMeta.version;
  const rv = remoteInfo.remoteLatestVersion;
  const lsha = localMeta.commit_sha;
  const rsha = remoteInfo.remoteLatestSha;

  const primaryDrift = versionRank(rv) > versionRank(lv);
  const fallbackDrift = !primaryDrift && lsha && rsha && lsha !== rsha;

  if (primaryDrift) {
    console.log(`HARNESS STALE: local harness ${lv} → remote ${rv}. Before starting the next task, run /skill:harness-check to sync (working tree dirty? ask the user first). Do not silently ignore this.`);
  } else if (fallbackDrift) {
    console.log(`HARNESS DRIFT: version matches (${lv}) but commit SHA differs from source. Before starting the next task, run /skill:harness-check (working tree dirty? ask the user first).`);
  }
}
