---
name: code-review
description: Systematic review of diffs, PRs and completed work — context first, then correctness, contracts and tests, with severity-ordered, evidence-backed findings.
---

# Code review

Review changes systematically. Report findings that change decisions, backed by evidence — not opinions.

## Process

1. **Get the diff and the claim.** Read the task, commit messages or PR description first: a review without intent is just a style audit. Skip docs-only, generated or whitespace-only changes.
2. **Read the surrounding code**, not only the diff: callers of changed functions, types touching changed fields, tests of changed behavior. Most false positives come from reviewing in isolation.
3. **Run the cheap truth**: typecheck, lint, tests. Evidence beats impressions.
4. **Filter pre-existing issues.** Verify each finding was actually introduced by this change; mark anything older as `pre-existing`.
5. **High-level pass** before line-by-line: does the solution fit the problem? Are public contracts and all callers safe? Does the change need tests?

## Line-by-line checklist (highest signal)

- Null/undefined access; falsy confusion (`0`, `''`, missing); off-by-one bounds; mutating a collection while iterating.
- Async: unawaited promises, missing catch, race conditions, stale closures.
- Security: injection, missing authorization checks, secrets in code or logs, XSS via unencoded user input.
- Error handling: empty catch blocks, swallowed errors, missing cleanup (finally), resource leaks.
- TypeScript: `any` and unsafe casts bypassing validation; non-null `!` on unverified values.
- React: `useEffect` missing deps or cleanup; index as `key` in dynamic lists; components defined inside components.

## Feedback rules

- **Evidence or silence.** Every finding cites `file:line`, what breaks, and a concrete fix.
- **Question > command.** "What happens if `items` is empty?" beats "This will fail".
- Taste is not a defect — style preferences are suggestions, never blockers; the linter owns style.
- Cap polish notes at ~3; severity-order everything: 🔴 blockers, 🟡 should-fix, 🟢 polish.

## Verdict

End with one line: APPROVE, APPROVE after blockers, or REQUEST CHANGES with a one-line reason.
