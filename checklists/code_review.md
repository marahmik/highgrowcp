# Code Review Checklist

Quick-reference for code reviews. Full policy: [`rules/code_review_policy.md`](../rules/code_review_policy.md)

**Confidence gate**: only report findings you are >=80% confident are real problems. Put lower-confidence observations in a Notes section.

## Security (CRITICAL — block on any finding)

- [ ] No hardcoded credentials, API keys, tokens, or secrets
- [ ] No SQL injection (parameterized queries, not string concatenation)
- [ ] No XSS (user input not rendered as raw HTML without sanitization)
- [ ] No path traversal (user-controlled paths sanitized)
- [ ] Auth checks present on all protected routes/endpoints
- [ ] No sensitive data (passwords, tokens, PII) written to logs

## Logic (HIGH)

- [ ] Edge cases handled (empty input, null/undefined, zero, negative)
- [ ] No off-by-one errors in loops and index operations
- [ ] Null/undefined safety (no implicit derefs without guard)
- [ ] Conditionals correct (not accidentally negated, missing else branch)

## Error handling (HIGH)

- [ ] No unhandled promise rejections or unguarded async calls
- [ ] No empty catch blocks that silently swallow failures
- [ ] User-facing errors are clear and do not leak internal details
- [ ] Failure paths are tested or at minimum reachable

## Performance (HIGH)

- [ ] No N+1 query patterns (data fetching inside loops)
- [ ] No unbounded loops or queries without limits on user-facing paths
- [ ] No obvious memory leaks (event listeners removed, subscriptions cleaned up)
- [ ] No blocking/synchronous I/O in async contexts

## Naming (MEDIUM)

- [ ] Names are clear and unambiguous at the call site
- [ ] Naming is consistent with the domain and existing conventions
- [ ] No single-letter variables outside trivial loop counters
- [ ] No magic numbers (use named constants)

## Tests (MEDIUM)

- [ ] New logic paths have corresponding tests
- [ ] Changed behavior reflected in updated tests
- [ ] No debug logging (`console.log`, etc.) left in production paths

## Complexity thresholds (MEDIUM — flag if exceeded)

- [ ] Functions <= 50 lines
- [ ] Files <= 800 lines
- [ ] Nesting depth <= 4 levels
- [ ] Cyclomatic complexity reasonable (~10 or fewer branches per function)

---

After review, record verdict:

```
| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL |       |        |
| HIGH     |       |        |
| MEDIUM   |       |        |
| LOW      |       |        |

Verdict: [APPROVE / WARNING / BLOCK]
```
