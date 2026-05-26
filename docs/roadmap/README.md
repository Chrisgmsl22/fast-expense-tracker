# fast-expense-tracker Roadmap

This is the single "where are we?" index for the project. Each phase has its
own file with vertical slices, marked as `[PR]`.

## Currently active

🟡 **Phase 0 — Bootstrap** is next up.

The full design spec is at [`docs/specs/0001-initial-design.md`](../specs/0001-initial-design.md). It defines what the app does, what it doesn't, and the 8-phase trajectory.

Slicing follows the **Foundation → Fan-out → Integration** pattern documented in [`docs/conventions/parallel-slicing.md`](../conventions/parallel-slicing.md). Parallelism is capped at 2 agents at once for v1.

## All phases

| Phase | Focus | Status | File |
|---|---|---|---|
| 0 | Bootstrap (Next.js + Tailwind + shadcn + Prisma + Neon + Vercel + CI) | 🟡 Next up | [phase-0-bootstrap.md](./phase-0-bootstrap.md) |
| 1 | Foundation (auth + capture/edit/delete + list + month filter) | 🔒 Locked | [phase-1-foundation.md](./phase-1-foundation.md) |
| 2 | Weekly Review (summary + category rollup + settlement workflow + settings) | 🔒 Locked | [phase-2-weekly-review.md](./phase-2-weekly-review.md) |
| 3 | Recurring (`isRecurring` checkbox + month-rollover modal + clone logic) | 🔒 Locked | [phase-3-recurring.md](./phase-3-recurring.md) |
| 4 | Dashboard (50/25/25 + by-category donut + by-card bar + subcategory drilldown) | 🔒 Locked | [phase-4-dashboard.md](./phase-4-dashboard.md) |
| 5 | Multi-currency (MXN canonical, USD/EUR reference) | 🔒 Locked | [phase-5-multi-currency.md](./phase-5-multi-currency.md) |
| 6 | Mobile Polish (FAB + optimistic UI + PWA install + inline-row capture) | 🔒 Locked | [phase-6-mobile-polish.md](./phase-6-mobile-polish.md) |
| 7 | Email Summary (Resend weekly cron, configurable day) | 🔒 Locked | [phase-7-email-summary.md](./phase-7-email-summary.md) |

**Status legend**: 🟢 Complete · 🟡 In Progress / Next up · 🔒 Locked (not started) · ⚪ Not started · 📋 Backlog

## How to use this roadmap

- **Active phase**: open the file marked 🟡. Slices listed at the top of the file are next up.
- **Plan blocks**: each slice in a phase has a Plan block (filled in when the slice becomes "next up" — see [`../conventions/slice-planning.md`](../conventions/slice-planning.md)).
- **Checking off tasks**: mark `[x]` as you complete them. When all tasks for a slice are checked, run the slice-lifecycle cleanup before opening the PR (per [`slice-planning.md`](../conventions/slice-planning.md)).
- **Phase status**: when a slice ships, update its phase file. When a phase fully ships, mark it 🟢 here AND update "Currently active" to point at the next phase.
- **Slicing pattern**: every phase has 1 Foundation slice (sequential), 0-4 Fan-out slices (parallel-capable), and 1 Integration slice (sequential after fan-out — except Phase 0 which has no Integration). See [`parallel-slicing.md`](../conventions/parallel-slicing.md).

## See also

- [`docs/specs/0001-initial-design.md`](../specs/0001-initial-design.md) — the full design spec (source of truth)
- [`docs/conventions/parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out→I pattern
- [`docs/conventions/slice-planning.md`](../conventions/slice-planning.md) — Plan block format
- [`docs/conventions/pr-strategy.md`](../conventions/pr-strategy.md) — vertical-slice philosophy
- [`docs/conventions/agent-workflow.md`](../conventions/agent-workflow.md) — `implementer` and `reviewer` invocation
- [`docs/decisions/`](../decisions/) — ADRs (architecture decision records)
