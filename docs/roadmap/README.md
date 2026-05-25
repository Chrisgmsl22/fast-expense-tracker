# fast-expense-tracker Roadmap

This is the single "where are we?" index for the project. Each phase has its
own file with vertical slices, marked as `[PR]`.

## Currently active

⚪ **Foundation in place — phases not yet defined.**

The repo infrastructure (conventions, ADRs, subagents) is complete. Feature
phases will be defined in the next planning session. See "Next planning
session" below.

## All phases

| Phase | Focus | Status | File |
|---|---|---|---|
| — | (TBD — feature scope discussion pending) | ⚪ Not started | — |

**Status legend**: 🟢 Complete · 🟡 In Progress · 🔒 Locked (not started) · ⚪ Not started · 📋 Backlog

## Next planning session

In the next conversation, the user and AI will discuss:

- **What this app will do** — feature scope (CRUD shape, dashboard requirements, etc.)
- **What this app will NOT do** — explicit non-goals
- **Phase breakdown** — how features group into ~5–7 phases
- **First phase to ship** — Phase 0 (bootstrap: Next.js scaffold, Neon DB, Vercel deploy, CI)

That session produces:

1. `docs/specs/0001-initial-design.md` — full design spec
2. `docs/roadmap/phase-0-bootstrap.md` and additional phase files
3. Updates to this README pointing at the active phase

Once that's in place, the slice → implementer → reviewer → PR cycle starts.

## How to use this roadmap

- Open the active phase file before starting work.
- Each slice in a phase has a Plan block (full or light — see `../conventions/slice-planning.md`).
- Check off tasks as you complete them.
- When a slice ships, mark its status and update this README's "Currently active" section.
- See [../conventions/pr-strategy.md](../conventions/pr-strategy.md) for how work is sliced.
- For design decisions that shape these phases, see [../decisions/](../decisions/).
