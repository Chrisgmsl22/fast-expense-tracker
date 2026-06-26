# ADR-0013: Screen-Driven Re-slice (Phase 2 & 4 → Confirmed Designs V1)

Date: 2026-06-25
Status: Accepted

## Context

Phases 2 (Weekly Review) and 4 (Dashboard) were sliced in the original roadmap
**before the UI designs existed** — a widget-level decomposition guessed at from
the spec (`getMonthSummary` util, settings page, top-line cards, category rollup,
by-category **donut**, by-card bar, subcategory drilldown, …).

The `Confirmed designs V1` handoff ([`docs/designs-screens/`](../designs-screens/README.md))
is now the **source of truth** — the closest thing to what the app should actually
look like. It reorganizes that same work **screen-by-screen** (Add expense,
Expenses, Income, Dashboard, Category detail, Settlement) and contradicts the old
slices in concrete ways:

- The dashboard's by-category chart is a **radar**, not a donut (old slice 4.2).
- Subcategory drilldown is its own **Category detail** screen, not a donut-click drawer.
- There is **no Settings screen** in V1, yet old slice 2.2 was "Settings page UI"
  and slice 3.3 (recurring-prompt suppression) depended on it.
- Income is a full **`Income` model** (fixed + variable), not the `Settings.monthlyIncome`
  stopgap the old dashboard slices assumed.

[`ui-build-plan.md`](../roadmap/ui-build-plan.md) already documented that the
screen-slices **supersede** the Phase 2 + Phase 4 decomposition, but the manifest
([`slices.json`](../roadmap/slices.json)) — which drives the derived-status engine
and the SessionStart `[roadmap]` hook (ADR-0008) — was never reconciled. The tracker
was steering by an obsolete map: surfacing 2.x/4.x slices we won't build and blind
to the 7 screens we will.

## Decision

Re-slice the manifest to the designs. Designs win wherever they conflict with the
pre-design slices.

- **Phase 2 redefined** from "Weekly Review" to **"Confirmed Designs V1 — screen
  build-out"**: six slices mapping 1:1 to `ui-build-plan.md` screens —
  2.1 Add-expense re-skin · 2.2 Expenses re-skin · 2.3 Income model + screen ·
  2.4 Dashboard · 2.5 Category detail · 2.6 Settlement + `Movement` UI. Login
  (screen #1) already shipped as slice 1.10.
- **Phase 4 retired.** Dashboard → 2.4, subcategory drilldown → 2.5. The phase
  file becomes a tombstone; the number is left vacant rather than renumbering
  Phases 5–7 (which would break existing PR/ADR/lesson references). No slice
  depends on `phase:4`, so the gap is dependency-safe.
- **Phase 2 deps encode the design's build order, not just data deps.** This phase
  is a **sequential screen track** (`ui-build-plan.md` execution model), so it
  deviates from the classic Foundation→Fan-out→Integration shape: only the two
  re-skins (2.1 ∥ 2.2, both gated on 1.6) are parallel-capable; 2.3→2.4→2.5→2.6
  run one screen at a time. The re-skins depend on **1.6** (edit/delete) so the
  capture modal + list are re-skinned once, with edit mode, not twice.
- **Slice 3.3** (recurring-prompt suppression) lost its `2.2` (Settings page)
  dependency; repointed to `3.1`. The settings surface it needs does not exist in
  V1 designs — flagged as an open question for when 3.3 goes next-up.

Phases 3 (recurring), 5 (multi-currency), 6 (mobile polish), 7 (email) are
unaffected in scope; their cross-phase `phase:2` deps now mean "the six screens
shipped."

## Consequences

**Positive:**

- The tracker reflects what we will actually build; `available next` matches the
  design build order.
- One source of truth for the screens (`ui-build-plan.md`) + a manifest that agrees
  with it.

**Negative / watch:**

- **Vacant Phase 4.** The "All phases" table shows no Phase 4; documented as
  retired here and in [`phase-4-dashboard.md`](../roadmap/phase-4-dashboard.md).
- **No Settings screen in V1.** Recurring-prompt suppression (3.3) and budget
  editing have no home yet — to be resolved in the owning slices.
- The recurring/multi-currency tracks become _available_ alongside the screen
  track once 1.6 ships; build sequencing across tracks is the orchestrator's call.
- `slices.json` is hand-edited only for deliberate planning/restructuring
  (ADR-0008) — this is one such event.
