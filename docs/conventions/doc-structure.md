# Doc Structure & Sizing

Keep markdown **small and readable**. A doc you can't read in one sitting is too
big. Line count is a **tripwire that triggers a "should this split?" decision** —
not a hard limit to game. Hard caps get gamed (cramming, mid-thought splits), so
the caps below are enforced by a **non-blocking warning**, never a block.

## Soft caps by doc type

These are ceilings; aim well under them.

| Doc type       | Path                    | Soft cap (lines) |
| -------------- | ----------------------- | ---------------- |
| ADR            | `docs/decisions/*.md`   | 200              |
| Convention     | `docs/conventions/*.md` | 300              |
| Spec           | `docs/specs/*.md`       | 400              |
| Plan           | `docs/plans/*.md`       | 600              |
| README / index | `**/README.md`          | 150              |
| Other docs     | `docs/*.md` (default)   | 300              |
| Reference      | `docs/reference/*.md`   | exempt           |
| Instructions   | `CLAUDE.md`             | exempt           |

**Plans** are the deliberate exception — they show every step, so they run long.
**Reference** docs (frozen lookup tables: categories, domain math) are exempt —
length is the point. **`CLAUDE.md`** is exempt — it's long-form instructions.

## When you're over the cap

Either **split** the doc or **justify inline** why it's monolithic. The usual
split: the narrative doc holds the _what/why_ and **links out to exhaustive
data** — the data lives in one source (e.g. a JSON manifest, a reference table),
never re-listed in prose. Example: the roadmap spec links to
[`slices.json`](../roadmap/slices.json) instead of re-tabulating 37 slices.

## Enforcement (non-blocking)

A pre-commit check warns when a staged doc exceeds its cap; the commit still
proceeds. It's a nudge to split-or-justify, not a gate.

- Doc sizing: [`scripts/check-doc-size.sh`](../../scripts/check-doc-size.sh), run from `.husky/pre-commit`.

## Commit messages

Commit messages follow the same "keep it small" principle. The rules live in
[`pr-strategy.md` §Commit guidelines](./pr-strategy.md) (Conventional Commits;
subject ≤72, imperative, stands alone; body omit-by-default, 1–3 lines, never
restate the diff). A non-blocking [`scripts/check-commit-msg.sh`](../../scripts/check-commit-msg.sh)
hook (`.husky/commit-msg`) warns on an over-long subject or a bloated body.
