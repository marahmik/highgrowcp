#!/usr/bin/env node
// git-commit-detect.mjs - shared `git commit` detection for the commit gates.
// Not a hook itself — imported by acceptance-gate, backpressure-gate, and
// review-gate (all PreToolUse: Bash) so they detect a commit identically.
//
// isGitCommit(command) -> boolean
//
// Replaces the old per-gate regex /(?:^|&&|\|\||;)\s*git\b[^|;]*\bcommit\b/, which
// had two defects (adversarial review then surfaced a long tail in both directions):
//   (1) false-NEGATIVE: a real `git commit` slipped past when separated by a NEWLINE
//       or single `&`, hidden behind an env-with-quoted-value or wrapper-with-options
//       prefix, behind a `bash -c`/`sh -c` variant, or behind a shell reserved word.
//   (2) false-POSITIVE: it fired on non-commit git commands whose args merely contain
//       "commit" (`git log --grep commit`), on sibling subcommands (`git commit-graph`,
//       `git commit-tree`), on commented-out / heredoc-body text, and on terminal global
//       options (`git --help commit`).
//
// Approach — a small, linear shell-aware lexer (NOT a full bash grammar):
//   lexSegments()  splits into top-level command segments. Quotes ('…'/"…") protect
//                  operators; `\`+newline is a line-join; an unquoted word-initial `#`
//                  starts a comment (dropped); `<<WORD` heredoc bodies are dropped;
//                  delimiters are && || ; | & and newline.
//   Per segment: tokenize() quote-aware, then locate the program being run — skipping
//   env-assignments and shell reserved words, and (for a wrapper command such as
//   sudo/env/nice/timeout, matched by BASENAME so `/usr/bin/env` counts) scanning past
//   its options for the first git/bash/sh program token. `bash -c "<inner>"` recurses on
//   the inner script. Fire only when the program is `git` (basename) and its SUBCOMMAND —
//   the first token after global options, with terminal options (--help/--version/…)
//   short-circuiting — is exactly `commit`.
//
// Bias: this is a SAFETY gate, so ambiguous/unparseable cases fail CLOSED (treated as a
// commit) rather than fail-open. Wrapper option arity is NOT modelled — we scan for the
// real program token instead, so unknown wrapper options can never hide the commit.
//
// Deliberate scope / known gaps (documented, asserted in tests):
//   - Cross-repo targeting (`git -C other commit`) is NOT special-cased — still detected.
//   - Commit hidden inside command substitution (`echo "$(git commit)"`), `env -S "git
//     commit"` split-string exec, `case … esac` pattern bodies, backslash-escaped
//     program names (`\git commit`), leading redirections before the command
//     (`>out git commit`), and process substitution (`cat <(git commit)`) are NOT
//     detected — all exotic and outside the (non-adversarial) agent threat model.
//   - Sequencer continuations that CREATE commits (`git merge --continue`,
//     `git cherry-pick --continue`, `git revert --continue`, `git rebase --continue`)
//     are NOT detected — the subcommand is not `commit`. Deliberate: this workflow is
//     main-centered (short-lived branches, squash-merge PRs; sequencers are ~unused),
//     so the gates skip them rather than carry an effective-diff model per sequencer.
//     Revisit if rebase/merge conflict-resolution becomes routine.
//   - The heredoc delimiter is parsed as ONE quoted atom or ONE simple bareword
//     (+ trailing CRs). Compound/odd-quoted delimiter WORDs (`<<'EOF'X`, `<<E"O"F`,
//     `<<EO\F`) and an empty/whitespace-only delimiter (`<<\r\n`, where `\s*` reaches
//     the next line) are mis-parsed, so a trailing commit after such a heredoc is
//     missed. Pre-existing (unchanged by the CRLF-terminator fix), fail-open, but only
//     reachable by deliberately bizarre delimiters — outside the agent threat model.
//   - A few exotic forms OVER-detect (fail-closed, harmless): `command -v git commit`
//     and `xargs echo git commit` are lookups/echoes, not commits, but report true.
//   - Past MAX_DEPTH of nested `bash -c`, detection FAILS CLOSED (treats it as a commit).

const MAX_DEPTH = 5;

const RESERVED = new Set(['if', 'then', 'elif', 'else', 'fi', 'while', 'until', 'for',
  'in', 'do', 'done', 'case', 'esac', 'function', '!', '{', '}']);

// Commands that exec the rest of the line (after their own options). Matched by basename.
const WRAPPER = new Set(['env', 'sudo', 'doas', 'nice', 'ionice', 'time', 'timeout',
  'command', 'nohup', 'stdbuf', 'setsid', 'xargs', 'exec']);

// Terminal/informational options that make a wrapper print-and-exit (never exec git).
const WRAPPER_TERMINAL_OPT = new Set(['--help', '--version', '-h', '-V']);

// git global options that take a SEPARATE argument (consume the next token too).
const GIT_OPT_WITH_ARG = new Set(['-C', '-c', '--config-env', '--git-dir', '--work-tree',
  '--namespace', '--exec-path', '--super-prefix']);
// Terminal/informational git global options: git prints and exits before any subcommand.
const GIT_TERMINAL_OPT = new Set(['-h', '--help', '--version', '--html-path',
  '--man-path', '--info-path']);

// bash/sh options that take a SEPARATE argument, consumed before locating `-c`.
const SHELL_OPT_WITH_ARG = new Set(['-o', '-O', '--rcfile', '--init-file']);

function basename(t) {
  const i = t.lastIndexOf('/');
  return i >= 0 ? t.slice(i + 1) : t;
}
function isAssign(t) { return /^[A-Za-z_][A-Za-z0-9_]*=/.test(t); }
function isShellProg(b) { return b === 'git' || b === 'bash' || b === 'sh'; }

// Split a command into top-level segments, dropping comments and heredoc bodies.
function lexSegments(cmd) {
  const segs = [];
  let cur = '', i = 0, q = null;            // q = "'" or '"' while inside that quote
  const heredocs = [];                       // delimiters opened on the current line
  const n = cmd.length;
  while (i < n) {
    const c = cmd[i], nx = cmd[i + 1];
    if (q === "'") { cur += c; if (c === "'") q = null; i++; continue; }
    if (q === '"') {
      if (c === '\\' && nx !== undefined) { cur += c + nx; i += 2; continue; }
      cur += c; if (c === '"') q = null; i++; continue;
    }
    if (c === '\\' && nx === '\n') { i += 2; continue; }                       // line join
    if (c === '\\' && nx === '\r' && cmd[i + 2] === '\n') { i += 3; continue; } // CRLF join
    if (c === '\\' && nx !== undefined) { cur += c + nx; i += 2; continue; }    // escape
    if (c === "'" || c === '"') { q = c; cur += c; i++; continue; }
    if (c === '#' && (cur === '' || /\s$/.test(cur))) {                        // comment
      while (i < n && cmd[i] !== '\n') i++;
      continue;
    }
    if (c === '<' && nx === '<' && cmd[i + 2] !== '<') {                        // heredoc start (not <<<)
      // Trailing CRs are CAPTURED INTO the delimiter: to bash `\r` is a word character,
      // not whitespace, so under CRLF input the delimiter word itself carries the CR(s)
      // (`<<EOF\r\n` -> delimiter "EOF\r", `<<'EOF'\r\n` -> "EOF\r" after quote removal)
      // and the terminator line — compared RAW, bash strips nothing — carries them too.
      // Mirroring that here keeps the drain's raw comparison in lockstep with bash for
      // CRLF, LF, and mixed input alike: a CR-less "EOF" line under a CRLF opener stays
      // DATA (no early termination), and a CRLF "EOF\r" terminator matches exactly.
      const m = /^<<(-?)\s*(?:'([^']+)'|"([^"]+)"|\\?([A-Za-z_][A-Za-z0-9_.-]*))(\r*)/.exec(cmd.slice(i));
      if (m) {
        heredocs.push({ delim: (m[2] ?? m[3] ?? m[4]) + m[5], strip: m[1] === '-' });
        cur += m[0]; i += m[0].length; continue;
      }
    }
    if (c === '\n' || c === '\r') {                                            // newline = separator
      segs.push(cur); cur = ''; i++;
      if (c === '\r' && cmd[i] === '\n') i++;
      while (heredocs.length) {                                                // drop heredoc bodies
        const { delim, strip } = heredocs.shift();
        while (i < n) {
          let j = i;
          while (j < n && cmd[j] !== '\n') j++;
          // RAW comparison, exactly like bash (it strips nothing — CR handling lives
          // in the delimiter capture above, which keeps CRLF terminators matching).
          const line = cmd.slice(i, j);
          i = j < n ? j + 1 : j;
          if ((strip ? line.replace(/^\t+/, '') : line) === delim) break;
        }
      }
      continue;
    }
    if (c === '&' && nx === '&') { segs.push(cur); cur = ''; i += 2; continue; }
    if (c === '|' && nx === '|') { segs.push(cur); cur = ''; i += 2; continue; }
    if (c === ';' || c === '|' || c === '&') { segs.push(cur); cur = ''; i++; continue; }
    cur += c; i++;
  }
  segs.push(cur);
  return segs;
}

// Quote-aware tokenizer: splits on unquoted whitespace and ( ) { } metacharacters,
// stripping the quotes.
function tokenize(s) {
  const toks = [];
  let cur = '', i = 0, q = null, started = false;
  while (i < s.length) {
    const c = s[i], n = s[i + 1];
    if (q) {
      if (q === '"' && c === '\\' && n !== undefined) { cur += n; i += 2; started = true; continue; }
      if (c === q) { q = null; i++; continue; }
      cur += c; i++; started = true; continue;
    }
    if (c === "'" || c === '"') { q = c; i++; started = true; continue; }
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r' ||
        c === '(' || c === ')' || c === '{' || c === '}') {
      if (started) { toks.push(cur); cur = ''; started = false; }
      i++; continue;
    }
    cur += c; i++; started = true;
  }
  if (started) toks.push(cur);
  return toks;
}

// Locate the index of the program token to analyze, or -1. Skips leading env-assignments
// and shell reserved words; for a wrapper command, scans past its options for the first
// git/bash/sh program (so unknown wrapper option arity can never hide the real command).
function programIndex(toks) {
  let i = 0;
  while (i < toks.length && (isAssign(toks[i]) || RESERVED.has(toks[i]))) i++;
  if (i >= toks.length) return -1;
  const b = basename(toks[i]);
  if (isShellProg(b)) return i;
  if (WRAPPER.has(b)) {
    for (let k = i + 1; k < toks.length; k++) {
      const t = toks[k];
      if (WRAPPER_TERMINAL_OPT.has(t)) return -1;       // wrapper prints help/version, never runs git
      if (isShellProg(basename(t))) return k;
    }
    return -1;
  }
  return i;                                              // some other program -> analyzed, will be non-git
}

// If toks is a bash/sh invocation, return the inner `-c` script string, else null.
function bashDashCPayload(toks) {
  let i = 1;
  while (i < toks.length) {
    const t = toks[i];
    if (!t.startsWith('-')) return null;            // a script FILE arg, not -c "string"
    if (/^-[A-Za-z]*c$/.test(t)) return i + 1 < toks.length ? toks[i + 1] : null; // …c takes next token
    if (SHELL_OPT_WITH_ARG.has(t)) { i += 2; continue; }
    i += 1;                                          // boolean option (-l, --noprofile, …)
  }
  return null;
}

function gitSubcommandIsCommit(toks) {
  let i = 1;
  while (i < toks.length) {
    const t = toks[i];
    if (!t.startsWith('-')) break;
    if (GIT_TERMINAL_OPT.has(t) || t.startsWith('--list-cmds')) return false;
    if (GIT_OPT_WITH_ARG.has(t)) { i += 2; continue; }
    i += 1;                                          // --opt=value or boolean global flag
  }
  return toks[i] === 'commit';
}

function segmentIsGitCommit(seg, depth) {
  const toks = tokenize(seg);
  const pi = programIndex(toks);
  if (pi < 0) return false;
  const rest = toks.slice(pi);
  const b = basename(rest[0]);
  if (b === 'bash' || b === 'sh') {
    const inner = bashDashCPayload(rest);
    if (inner === null) return false;
    if (depth >= MAX_DEPTH) return true;             // fail CLOSED on pathological nesting
    return anySegmentIsCommit(inner, depth + 1);
  }
  if (b === 'git') return gitSubcommandIsCommit(rest);
  return false;
}

function anySegmentIsCommit(cmd, depth) {
  if (!cmd || typeof cmd !== 'string') return false;
  for (const seg of lexSegments(cmd)) {
    if (segmentIsGitCommit(seg, depth)) return true;
  }
  return false;
}

export function isGitCommit(command) {
  return anySegmentIsCommit(command, 0);
}

// --- commit FORM parsing (for review-gate effective-content hashing) ---------
// isGitCommit answers "does this line run a commit?"; parseCommitForm answers
// "can the review-gate statically hash what this commit will capture, and how?"
// so the gate hashes the EFFECTIVE committed diff instead of only the staged diff.
// This closes the gap where `git commit -a` pulled in tracked changes the staged
// hash never saw, letting a stale PASS review match the wrong content.
//
// parseCommitForm(command) -> { verifiable:true, all:bool } | { verifiable:false }
//   verifiable:true  => the committed content is exactly one of two diffs in the
//                       hook's cwd: all=true -> `git diff HEAD` (a -a/--all commit
//                       captures every tracked change); else -> `git diff --cached`
//                       (a plain commit captures the index).
//   verifiable:false => the content cannot be reproduced by a fixed diff in this
//                       cwd, so the gate fails closed (block on high/critical;
//                       review-skip is the escape hatch). This covers, deliberately:
//                         • pathspec commits (`git commit foo.ts`) — the path set is
//                           shell-fragile (escapes, globs) and cwd-relative;
//                         • --amend / --include(-i) / --interactive(-p) /
//                           --pathspec-from-file — non-index or interactive content;
//                         • a commit behind bash -c, or >1 commit in one line;
//                         • a `&`-bearing shell redirection (`2>&1`, `>&2`, `&>x`):
//                           the reused lexer splits on its lone `&`, which would shred
//                           the arg list and hide a trailing `-a` — so we fail closed;
//                         • repo/worktree/index redirection — repo-redirecting globals
//                           (-C / --git-dir / --work-tree / --namespace), the matching
//                           GIT_DIR / GIT_WORK_TREE / GIT_INDEX_FILE / GIT_NAMESPACE /
//                           GIT_COMMON_DIR env assignments, and `-c core.worktree|bare|
//                           gitdir` / `--config-env` — each targets another tree the
//                           cwd diff would mis-hash.
//
// Safety-gate bias (as in isGitCommit): only the two cleanly-reproducible forms are
// verifiable; ANYTHING else falls into verifiable:false (fail-closed), never a
// wrong-but-confident plain/all classification (which would fail OPEN). Long options
// are matched the way git resolves them — by unambiguous PREFIX — so `--amen` /
// `--inc` cannot sneak past the unverifiable set. Two rounds of adversarial review
// (codex + code-reviewer) drove this: exact-string option matching, pathspec hashing,
// ignoring shell redirections / bash-c siblings, and the `&`-redirection segment split
// were each a fail-open or a self-commit regression.
//
// Known NON-ADVERSARIAL limitations (consistent with isGitCommit's stated model —
// these are wrong-tree hashes or detection misses, not honored here):
//   • a `cd`/`pushd` to a DIFFERENT repo before the commit (`cd ../other && git commit`)
//     — same-repo cd is safe and common, so blanket-blocking it is pure friction;
//   • `env -C`/`--chdir` cwd changes, and a pathspec quoted to look like a redirection
//     (`git commit -- '>f.ts'`) — tokenize() discards the quote, an absurd filename;
//   • forms isGitCommit itself does not detect ($(…) / `env -S` / leading `>out …` /
//     process substitution) bypass this gate upstream — see isGitCommit's header.

// git commit options that consume a SEPARATE value token (long form). Excludes
// --gpg-sign / -S: their <keyid> is optional and attaches only with `=`, so a
// following token is NOT their value.
const COMMIT_LONG_VALUE_OPT = new Set(['--message', '--file', '--author', '--date',
  '--template', '--reuse-message', '--reedit-message', '--fixup', '--squash',
  '--trailer', '--cleanup']);
// Long options that defeat static effective-content hashing -> unverifiable. Matched
// by git's unambiguous-prefix rule (see isUnverifiableLong), so abbreviations count.
const COMMIT_UNVERIFIABLE_LONG = ['--amend', '--include', '--interactive', '--patch',
  '--pathspec-from-file'];
// Short value-taking commit flags; may be the tail of a bundle (`-am "msg"`).
const COMMIT_SHORT_VALUE = new Set(['m', 'F', 'C', 'c', 't']);
// git global options that redirect to another repo/worktree/dir: a cwd diff would
// hash the wrong tree, so any commit carrying one is unverifiable.
const GIT_REPO_REDIRECT_OPT = new Set(['-C', '--git-dir', '--work-tree', '--namespace']);
// Same, via the environment: a leading `GIT_DIR=… git commit` retargets the repo.
const GIT_REPO_REDIRECT_ENV = /^GIT_(DIR|WORK_TREE|INDEX_FILE|NAMESPACE|COMMON_DIR)=/;
// `-c <key>` / `--config-env` keys that move the repo root/worktree/index.
const GIT_REPO_REDIRECT_CONFIG = /^core\.(worktree|bare|git-?dir|common-?dir)\b/i;

// True if the command contains an unquoted `&` that is part of a shell redirection
// (`2>&1`, `>&2`, `<&3`, `&>file`): the `&` is adjacent to a `<`/`>`. The reused
// lexSegments() treats any lone `&` as a control operator and splits on it, which
// would shred a commit's arg list (hiding a later `-a`); detecting it lets us fail
// closed before that happens. Quote-aware; not heredoc-aware, so a commit message
// body literally containing `2>&1` fails closed too (rare, and safe).
function hasAmpRedirection(cmd) {
  let q = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (q) { if (c === q) q = null; else if (q === '"' && c === '\\') i++; continue; }
    if (c === "'" || c === '"') { q = c; continue; }
    if (c === '\\') { i++; continue; }
    if (c === '&' && (cmd[i - 1] === '>' || cmd[i - 1] === '<' || cmd[i + 1] === '>')) return true;
  }
  return false;
}

// True when `name` (a long option as typed, sans `=value`) resolves to one of the
// unverifiable options under git's unambiguous-prefix rule: `name` is a prefix of
// (or equal to) such an option. An abbreviation that is ALSO a prefix of some safe
// option is ambiguous and git itself rejects it (no commit runs), so treating it as
// unverifiable only ever errs toward blocking — never toward a false allow.
const isUnverifiableLong = (name) =>
  COMMIT_UNVERIFIABLE_LONG.some((opt) => opt.startsWith(name));

// tokenize() is quote-aware but NOT redirection-aware, so shell redirections survive
// as tokens (`>out`, `2>&1`, `<`, `<<MSG`, `<<'EOF'`→`<<EOF`). They are NOT git args
// and must be dropped before classification — otherwise the repo's own self-commit
// `git commit -F - <<'MSG'` would read `<<MSG` as a pathspec and mis-hash. Returns
// null (not a redirection) or { standalone } where standalone means the operator has
// no glued operand and the NEXT token is its target.
function redirToken(t) {
  const m = /^(?:\d+|&)?(?:>>|>\||>&|<<-|<<<|<<|<>|<|>)/.exec(t);
  if (!m) return null;
  return { standalone: t.length === m[0].length };
}

// Inspect one segment. Returns null (not a commit here), { unverifiable:true } (an
// indirect/bash-c commit or a repo-redirecting global), or { args } (the tokens after
// `commit` in a direct `git … commit`).
function commitSegInfo(seg) {
  const toks = tokenize(seg);
  const pi = programIndex(toks);
  if (pi < 0) return null;
  // A repo-redirecting env assignment before the program (`GIT_DIR=… git commit`,
  // also `env GIT_DIR=… git commit`) makes the cwd diff hash the wrong tree.
  if (toks.slice(0, pi).some((t) => GIT_REPO_REDIRECT_ENV.test(t))) {
    return segmentIsGitCommit(seg, 0) ? { unverifiable: true } : null;
  }
  const rest = toks.slice(pi);
  if (basename(rest[0]) !== 'git') {
    // A non-git program here may still wrap a commit (e.g. bash -c "git commit").
    return segmentIsGitCommit(seg, 0) ? { unverifiable: true } : null;
  }
  let i = 1, redirect = false;                        // skip git global options
  while (i < rest.length) {
    const t = rest[i];
    if (!t.startsWith('-')) break;
    if (GIT_TERMINAL_OPT.has(t) || t.startsWith('--list-cmds')) return null;
    const nameOnly = t.includes('=') ? t.slice(0, t.indexOf('=')) : t;
    if (GIT_REPO_REDIRECT_OPT.has(nameOnly)) redirect = true;
    if (nameOnly === '--config-env') redirect = true;                 // -> alternate config
    if (t === '-c' && GIT_REPO_REDIRECT_CONFIG.test(rest[i + 1] || '')) redirect = true;
    if (GIT_OPT_WITH_ARG.has(t)) { i += 2; continue; }
    i += 1;
  }
  if (rest[i] !== 'commit') return null;
  if (redirect) return { unverifiable: true };
  return { args: rest.slice(i + 1) };
}

// Classify the post-`commit` argument tokens. Any pathspec, interactive/include
// form, or unverifiable option collapses to { verifiable:false }.
function classifyCommitArgs(args) {
  let all = false, endOpts = false, hasPathspec = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const r = redirToken(a);                          // drop shell redirections first
    if (r) { if (r.standalone) i += 1; continue; }    // (a standalone operator eats its target)
    if (endOpts) { hasPathspec = true; continue; }
    if (a === '--') { endOpts = true; continue; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const name = eq >= 0 ? a.slice(0, eq) : a;
      if (isUnverifiableLong(name)) return { verifiable: false };
      if (name === '--all') { all = true; continue; }
      if (name === '--no-all') { all = false; continue; }
      if (name === '--only') continue;                // --only without a pathspec is a git error; harmless
      if (COMMIT_LONG_VALUE_OPT.has(name) && eq < 0) i += 1;  // consume separate value
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {          // short flag bundle
      for (let j = 1; j < a.length; j++) {
        const ch = a[j];
        if (ch === 'a') { all = true; continue; }
        if (ch === 'i' || ch === 'p') return { verifiable: false };
        if (ch === 'S' || ch === 'u') break;          // optional GLUED value: rest isn't flags
        if (COMMIT_SHORT_VALUE.has(ch)) {             // value-taker ends the bundle
          if (j + 1 >= a.length) i += 1;              // value is the NEXT token
          break;                                      // (a glued value needs no consume)
        }
        // other boolean short flag (o/e/q/v/n/s/z/…) -> ignored
      }
      continue;
    }
    hasPathspec = true;                               // bare positional token -> pathspec
  }
  if (hasPathspec) return { verifiable: false };      // pathspec commits: fail-closed
  return { verifiable: true, all };
}

export function parseCommitForm(command) {
  if (!command || typeof command !== 'string') return { verifiable: false };
  // A `&`-bearing redirection would split mid-args in lexSegments below and could
  // hide a trailing -a; fail closed before trusting the segmentation.
  if (hasAmpRedirection(command)) return { verifiable: false };
  let found = null;
  for (const seg of lexSegments(command)) {
    const info = commitSegInfo(seg);
    if (!info) continue;
    if (info.unverifiable) return { verifiable: false };
    if (found) return { verifiable: false };          // >1 direct commit in one line
    found = info.args;
  }
  if (!found) return { verifiable: false };
  return classifyCommitArgs(found);
}

// --- WIP marker detection (for acceptance-gate's in-progress bypass) ---------
// A WIP commit is an intentional mid-task checkpoint: the acceptance-gate should
// not force all AC checked (nor the blunt acceptance-done flag) for every such
// commit. We detect a `wip:` / `[wip]` marker in the commit MESSAGE, taken from
// -m / --message (separate, `=`, glued `-mmsg`, or bundled `-am "msg"`) of the
// ACTUAL commit segment(s) — scoped via lexSegments/commitSegInfo, NOT a whole-line
// scan, so a `-m "wip…"` in a comment / heredoc body / sibling command (`grep -m`)
// does not false-trigger. A message via -F / heredoc carries no -m token -> not WIP
// (the gate applies normally; use acceptance-done for those). Multi-commit lines
// bypass only if EVERY commit is WIP (a non-WIP completion commit must still gate).
// Best-effort, not a safety gate.
// WIP_MARKER: subject begins with the word "wip" (wip:, wip(x):, WIP …) OR carries a
// [wip] tag. `wip\b` requires a full word, so "wiping"/"wipe" do NOT match.
const WIP_MARKER = /(^\s*wip\b)|(\[wip\])/i;

// Scan one commit's post-`commit` arg tokens for a WIP marker in -m/--message.
function commitArgsHaveWip(args) {
  for (let i = 0; i < args.length; i++) {
    const t = args[i];
    if (t === '-m' || t === '--message') { if (WIP_MARKER.test(args[i + 1] || '')) return true; i++; continue; }
    if (t.startsWith('--message=')) { if (WIP_MARKER.test(t.slice(10))) return true; continue; }
    if (t.startsWith('-m') && !t.startsWith('--')) { if (WIP_MARKER.test(t.slice(2))) return true; continue; } // -mmsg
    if (/^-[A-Za-z]*m$/.test(t)) { if (WIP_MARKER.test(args[i + 1] || '')) return true; i++; continue; }        // -am "msg"
  }
  return false;
}

export function isWipCommit(command) {
  if (!command || typeof command !== 'string') return false;
  let sawCommit = false;
  for (const seg of lexSegments(command)) {
    const info = commitSegInfo(seg);
    if (!info) continue;                                  // not a commit segment
    if (info.unverifiable || !info.args) return false;    // unreadable commit (bash -c / redirect) -> don't bypass
    sawCommit = true;
    if (!commitArgsHaveWip(info.args)) return false;       // a non-WIP commit present -> don't bypass
  }
  return sawCommit;
}
