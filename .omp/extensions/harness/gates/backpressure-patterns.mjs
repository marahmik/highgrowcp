#!/usr/bin/env node
// backpressure-patterns.mjs - shared build/test/lint command detection.
// Not a hook itself — imported by backpressure-tracker (PostToolUse) and
// backpressure-failure-tracker (PostToolUseFailure) so both classify a
// command identically.
//
// classifyVerification(command) -> { isVerification, type, passReliable }
//
// The command is split into top-level shell segments by a QUOTE-AWARE scanner
// (splitTopLevel): operators && || ; | & inside single/double quotes or after a
// backslash are NOT treated as delimiters. Each segment is trimmed and unwrapped
// of VAR=val / env / time / sudo / nice / npx / a leading (subshell), then
// matched on its LEADING TOKEN anchored with (?=\s|$) — never a raw substring.
// `bash -c "<inner>"` / `sh -c "<inner>"` is classified by RECURSING on <inner>
// so the inner command's own operators count toward reliability too. So
// `echo "x; npm test && ok"`, `grep "npm test" f`, `npx tsc-alias`,
// `make-release.sh` do NOT match, while `npm test`, `npm t`,
// `CI=1 pnpm test:unit`, `time ./gradlew test`, `python -m pytest`,
// `cd x && npm run build`, and `bash -c "npm test"` do.
//
// passReliable: whether a *success* should be trusted as a passing verification.
// PostToolUse fires when the OVERALL shell exit is 0, which does NOT imply the
// verification command itself passed when its exit is swallowed downstream:
//   `npm test || true`   (|| swallows failure)
//   `npm test; echo ok`  (;  overall exit is the last command's)
//   `npm test | tee log` (|  pipeline-HEAD exit discarded, no pipefail)
//   `npm test &`         (&  backgrounded; shell returns 0 immediately)
// and the same operators nested inside `bash -c "..."`. passReliable is true
// only when every operator after the matched segment (at every recursion level)
// is `&&`. Otherwise the success tracker must NOT record PASS (leaving status
// unverified is fail-safe). Not handled (treated as unreliable / fail-safe):
// `set -o pipefail`, command substitution, and recursion past MAX_DEPTH.
//
// Failure capture is intentionally LIBERAL (isVerification alone): for a chained
// `npm test && deploy` that fails, the failure may be `deploy`, not the test —
// recording FAIL over-blocks, which is fail-safe (operator re-runs a clean
// verification), so we accept that misattribution rather than miss a real failure.

const MAX_DEPTH = 5;

const VERIFY = [
  // order matters: lint before build so `tsc --noEmit` labels as lint, not build.
  ['test',  /^(npm (run )?(t|test)|pnpm (run )?test[\w:.-]*|yarn (run )?test[\w:.-]*|jest|vitest|pytest|python3? -m pytest|node --test|cargo test|go test|mvn test|gradle test|(\.\/)?gradlew test|(\.\/)?mvnw test)(?=\s|$)/],
  ['lint',  /^(npm run lint|pnpm (run )?lint[\w:.-]*|yarn (run )?lint[\w:.-]*|eslint|prettier (--check|-c)|tsc --noEmit|cargo clippy|golangci-lint)(?=\s|$)/],
  ['build', /^(npm run build|pnpm (run )?build[\w:.-]*|yarn (run )?build[\w:.-]*|tsc|make|cargo build|go build|mvn compile|gradle build|(\.\/)?gradlew build|(\.\/)?mvnw compile)(?=\s|$)/],
];

// Quote-aware split into top-level segments + the operators between them.
// Returns { segs, ops } with ops.length === segs.length - 1; ops[i] is the
// operator between segs[i] and segs[i+1] (one of && || ; | &).
function splitTopLevel(cmd) {
  const segs = [], ops = [];
  let cur = '', i = 0, q = null; // q = "'" or '"' while inside that quote
  let prevGt = false;            // last emitted char was an UNescaped, UNquoted top-level `>`
  while (i < cmd.length) {
    const c = cmd[i], n = cmd[i + 1];
    if (q === "'") { cur += c; if (c === "'") q = null; prevGt = false; i++; continue; }
    if (q === '"') {
      if (c === '\\' && n !== undefined) { cur += c + n; prevGt = false; i += 2; continue; }
      cur += c; if (c === '"') q = null; prevGt = false; i++; continue;
    }
    if (c === "'" || c === '"') { q = c; cur += c; prevGt = false; i++; continue; }
    if (c === '\\' && n !== undefined) { cur += c + n; prevGt = false; i += 2; continue; }
    if (c === '&' && n === '&') { segs.push(cur); ops.push('&&'); cur = ''; prevGt = false; i += 2; continue; }
    if (c === '|' && n === '|') { segs.push(cur); ops.push('||'); cur = ''; prevGt = false; i += 2; continue; }
    if (c === ';') { segs.push(cur); ops.push(';'); cur = ''; prevGt = false; i++; continue; }
    if (c === '|') { segs.push(cur); ops.push('|'); cur = ''; prevGt = false; i++; continue; }
    // A `&` that is part of a redirection (`2>&1`, `>&2`, `&>file`) is NOT a
    // backgrounding operator — keep it in the segment so it doesn't break an
    // otherwise-reliable `&&` chain (e.g. `npm test 2>&1 && deploy`). Decide on the
    // emitted-token flag (not cur.endsWith('>')) so an escaped/quoted `\>` is not
    // mistaken for a redirection (which would risk recording a false PASS).
    if (c === '&' && (prevGt || n === '>')) { cur += c; prevGt = false; i++; continue; }
    if (c === '&') { segs.push(cur); ops.push('&'); cur = ''; prevGt = false; i++; continue; }
    cur += c; prevGt = (c === '>'); i++;
  }
  segs.push(cur);
  return { segs, ops };
}

// Peel leading wrappers that don't change which program controls the exit.
// (bash -c "..." is handled separately, by recursion, in classifySegment.)
function unwrap(seg) {
  let s = seg.trim();
  if (s.startsWith('(')) s = s.replace(/^\(\s*/, '').replace(/\s*\)\s*$/, ''); // (subshell)
  let prev;
  do {
    prev = s;
    s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '');       // VAR=val ...
    s = s.replace(/^env\s+(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)*/, ''); // env VAR=val ...
    s = s.replace(/^(?:time|sudo|nice|ionice)\s+/, '');
    s = s.replace(/^npx\s+/, '');
  } while (s !== prev);
  return s;
}

// Classify a single segment -> { type, reliable } or null.
// `reliable` reflects ONLY this segment's internal structure (e.g. operators
// hidden inside a bash -c payload); the caller combines it with outer operators.
function classifySegment(seg, depth) {
  const s = unwrap(seg);
  const m = s.match(/^(?:bash|sh)\s+-c\s+(['"])([\s\S]*)\1\s*$/); // bash -c "<inner>"
  if (m) {
    if (depth >= MAX_DEPTH) return null; // pathological nesting -> fail-safe no-match
    const inner = classify(m[2], depth + 1);
    return inner.isVerification ? { type: inner.type, reliable: inner.passReliable } : null;
  }
  for (const [type, re] of VERIFY) {
    if (re.test(s)) return { type, reliable: true };
  }
  return null;
}

function classify(command, depth) {
  if (!command || typeof command !== 'string') {
    return { isVerification: false, type: '', passReliable: false };
  }
  const { segs, ops } = splitTopLevel(command);
  let matchIdx = -1, type = '', reliable = true;
  for (let i = 0; i < segs.length; i++) {
    const r = classifySegment(segs[i], depth);
    if (r) { matchIdx = i; type = r.type; reliable = r.reliable; break; }
  }
  if (matchIdx === -1) {
    return { isVerification: false, type: '', passReliable: false };
  }
  // Reliable iff this segment is internally reliable AND every operator after
  // it (at this level) is `&&`.
  let passReliable = reliable;
  for (let j = matchIdx; j < ops.length && passReliable; j++) {
    if (ops[j] !== '&&') passReliable = false;
  }
  return { isVerification: true, type, passReliable };
}

export function classifyVerification(command) {
  return classify(command, 0);
}
