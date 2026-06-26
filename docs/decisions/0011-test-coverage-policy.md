# ADR-0011: Tiered test-coverage policy, phased rollout

Date: 2026-06-24
Status: Accepted — **rollout revised by [ADR-0012](./0012-integration-tests-for-db-layer.md)** (2026-06-25): the tiered gate never goes blocking; coverage is advisory and the DB layer is tested via integration, because the coverage reporter unreliably drops Prisma-importing files. The tiering below still describes the _aspiration_ for reliably-measured layers.

## Context

The repo had Vitest + RTL but **no coverage measurement or gate**, so test
thoroughness varied per slice (the 1.10 login slice shipped with few component
tests until prompted). We want coverage enforced in CI so an agent can verify it
before opening a PR — but a blanket **100% global** gate is a known anti-pattern:
it forces hollow tests (or an ever-growing exclude list) for server components,
auth/route wiring, config, and vendored UI primitives, which rewards gaming over
quality. Existing Phase-1 code also isn't fully covered yet, so flipping any
meaningful gate to blocking immediately would break CI.

## Decision

**Tiered thresholds**, scoped to the testable layers (`vitest.config.ts`):

| Scope                                    | Target |
| ---------------------------------------- | ------ |
| Logic core — `lib/**`, `app/_actions/**` | 100%   |
| Components — `components/**`             | 90%    |
| Global floor                             | 80%    |

**Not measured** (outside the `include` allowlist — a few are also in `exclude`;
Playwright E2E covers them instead): server components
`app/**/{page,layout,loading,error}.tsx`, `auth*.ts`, `proxy.ts`, config,
`prisma/`, `scripts/`, `components/ui/**` (vendored shadcn/Base UI), `lib/db.ts`
(Prisma singleton), `*.d.ts`.

**Phased rollout:**

1. **Now (this PR):** add `@vitest/coverage-v8`, the tiered config, a
   `pnpm test:coverage` script, and a **non-blocking** CI step
   (`continue-on-error`). Coverage is reported, not enforced.
2. **Backfill PR:** write the missing tests to meet the thresholds **and** fix
   the v8 multi-environment reporting quirk (see below).
3. **Flip to blocking:** drop `continue-on-error` so the gate fails CI.

The how-to lives in [`testing.md`](../conventions/testing.md).

## Consequences

**Positive**

- Coverage is visible immediately; the bar is explicit and honest (rigorous
  where logic lives, exclusions named).
- CI never breaks mid-flight — enforcement arrives only once the codebase meets it.
- A pre-PR `pnpm test:coverage` gives agents a concrete check.

**Negative / known issues**

- **Report-only until the backfill PR** — the thresholds don't block yet.
- **v8 multi-environment quirk:** with mixed `jsdom` + `node` (`// @vitest-environment node`)
  suites, v8 coverage aggregation drops **all** `lib` files from the full-run
  report (they report correctly in isolation). The 100% `lib` threshold is therefore not yet
  reliably evaluated. The backfill PR resolves this (likely Vitest
  projects-per-environment) before the gate goes blocking.

## References

- `vitest.config.ts` — provider, include/exclude, thresholds.
- `docs/conventions/testing.md` — what/how to test per layer.
- `.github/workflows/ci.yml` — the non-blocking coverage step.
