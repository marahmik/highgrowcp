#!/usr/bin/env node
// risk-assess.mjs - Shared risk assessment module for harness gates
// Not a hook itself — imported by other hooks.
// Usage: import { assessRisk } from './risk-assess.mjs';

import { execSync } from 'child_process';

// Secret/material: a credential, token, password, or key/secret file is high-risk in ANY file
// type — these can be leaked into prose too, so they are checked BEFORE the doc exemption.
const HIGH_RISK_MATERIAL_PATTERNS = [
  /\.(env|pem|key|secret)$/i,
  /password|credential|token/i,
];

// Topic: filename substrings that indicate security-adjacent CODE/config. Noisy against prose
// (a `*_policy.md` doc, an `author-guide.md`), so passive prose docs are exempt from THESE — but
// real code (.ts/.sql/...) named for the topic stays high-risk.
const HIGH_RISK_TOPIC_PATTERNS = [
  /auth/i,
  /rls|policy|policies/i,
  /migration/i,
  /schema/i,
];

const CODE_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.java', '.rb', '.php',
  '.sql', '.sh',
];

const DOCS_EXTENSIONS = ['.md', '.txt', '.mdx'];

// Passive prose extensions exempt from TOPIC high-risk matching. Excludes `.mdx` — MDX can import
// components and execute JSX, so it is not treated as passive here even though it counts as docs
// for the lower-stakes docs-only classification.
const PROSE_DOC_EXTENSIONS = ['.md', '.txt'];

const CONFIG_EXTENSIONS = ['.json', '.yaml', '.yml', '.toml', '.xml', '.ini'];

const CI_BUILD_PATTERNS = [
  /package\.json$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
  /tsconfig.*\.json$/,
  /\.github\/workflows\//,
  /\.gitlab-ci\.yml$/,
  /Dockerfile/,
  /docker-compose/,
  /\.env\.example$/,
  /Makefile$/,
];

// Case-insensitive file-extension test — paths can be any case, classification never should be.
const endsWithExt = (filePath, exts) => {
  const lower = filePath.toLowerCase();
  return exts.some((ext) => lower.endsWith(ext));
};

// Classify a single path as security-high-risk. Order matters:
//  1. Secret/material (credential/token/password/key/secret) is high-risk in ANY file type,
//     including prose — a secret leaked into a .md/.txt must NOT slip through. Checked first.
//  2. Passive prose docs (.md/.txt) are then exempt from the noisy TOPIC substrings
//     (auth/policy/migration/schema): editing a doc ABOUT auth is not a live security change.
//     This is what fixes the footgun where `*_policy.md` / `author-guide.md` were misclassified
//     CRITICAL, forcing test-verification + adversarial review on prose (the primary activity in a
//     policy-doc repo).
//  3. Everything else — code/config, and .mdx (which can execute JSX) — is matched on topic.
// Real security code/config is never a prose extension, so the exemption adds no false-negative
// for live security files. Matching is case-insensitive on both sides. A non-doc topic substring
// (e.g. a hypothetical `author.ts`) is intentionally left matching — a safety gate prefers a
// false-positive over a missed real file.
export function isHighRiskFile(filePath) {
  if (HIGH_RISK_MATERIAL_PATTERNS.some((p) => p.test(filePath))) return true;
  if (endsWithExt(filePath, PROSE_DOC_EXTENSIONS)) return false;
  return HIGH_RISK_TOPIC_PATTERNS.some((p) => p.test(filePath));
}

// The diff scope the commit will ACTUALLY capture, mirroring review-gate's hash scope
// so risk is assessed on the same content that gets committed (parseCommitForm result):
//   plain commit  -> the staged index only        (git diff --cached)
//   -a / --all     -> all tracked modifications     (git diff HEAD)
//   any other/unknown form, or no form passed -> the conservative union of staged +
//     unstaged, so an unverifiable form (or a caller that does not know the form) never
//     UNDER-estimates risk. The previous staged∪unstaged union over-counted a plain
//     commit: unrelated unstaged changes inflated its risk and could falsely BLOCK it.
function diffRanges(form) {
  if (form && form.verifiable) return [form.all ? 'HEAD' : '--cached'];
  return ['--cached', ''];          // '' selects the unstaged working tree
}

export function assessRisk(cwd, form) {
  const ranges = diffRanges(form);
  let changedFiles;
  try {
    const names = ranges.flatMap((r) =>
      execSync(`git diff ${r} --name-only`, { cwd, encoding: 'utf-8' }).trim().split('\n')
    );
    changedFiles = [...new Set(names)].filter(Boolean);
  } catch {
    return { level: 'unknown', reason: 'git diff failed', files: [] };
  }

  if (changedFiles.length === 0) {
    return { level: 'none', reason: 'no changes', files: [] };
  }

  const hasCIBuild = changedFiles.some(f =>
    CI_BUILD_PATTERNS.some(p => p.test(f))
  );

  const isDocsOnly = changedFiles.every(f =>
    endsWithExt(f, DOCS_EXTENSIONS) || f.toLowerCase().startsWith('docs/')
  );

  const isConfigOnly = changedFiles.every(f =>
    endsWithExt(f, CONFIG_EXTENSIONS) || endsWithExt(f, DOCS_EXTENSIONS)
  );

  const hasCode = changedFiles.some(f => endsWithExt(f, CODE_EXTENSIONS));

  const hasHighRisk = changedFiles.some(isHighRiskFile);

  let diffSize = 0;
  try {
    for (const r of ranges) {
      const stat = execSync(`git diff ${r} --shortstat`, { cwd, encoding: 'utf-8' }).trim();
      const insertions = stat.match(/(\d+) insertion/);
      const deletions = stat.match(/(\d+) deletion/);
      if (insertions) diffSize += parseInt(insertions[1]);
      if (deletions) diffSize += parseInt(deletions[1]);
    }
  } catch { /* ignore */ }

  if (hasHighRisk) {
    return {
      level: 'critical',
      reason: 'security/auth/migration files changed',
      files: changedFiles,
      diffSize,
    };
  }

  if (hasCode && diffSize > 100) {
    return {
      level: 'high',
      reason: `${diffSize}+ lines of code changed`,
      files: changedFiles,
      diffSize,
    };
  }

  if (hasCode) {
    return {
      level: 'medium',
      reason: 'code changes detected',
      files: changedFiles,
      diffSize,
    };
  }

  if (isDocsOnly) {
    return {
      level: 'low',
      reason: 'documentation only',
      files: changedFiles,
      diffSize,
    };
  }

  if (isConfigOnly) {
    if (hasCIBuild) {
      return { level: 'medium', reason: 'CI/build config changed', files: changedFiles, diffSize };
    }
    return {
      level: 'low',
      reason: 'config/docs only',
      files: changedFiles,
      diffSize,
    };
  }

  return {
    level: 'medium',
    reason: 'mixed changes',
    files: changedFiles,
    diffSize,
  };
}
