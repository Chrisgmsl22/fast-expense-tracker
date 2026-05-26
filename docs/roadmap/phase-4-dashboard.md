# Phase 4: Dashboard

**Status**: 🔒 Locked (Phase 3 must ship first — recurring rows feed the dashboard)
**Outcome**: 50/25/25 progress + by-category donut + by-card bar + subcategory drilldown.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 4](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out→I

This is "Path C" from the brainstorming session — the real visual
dashboard. Most ambitious phase by visual surface area. Resolves the
**chart library** open question from ADR-0001.

The 50/25/25 logic follows [`domain-reference.md §1`](../reference/domain-reference.md) — Essentials (50%) / Discretionary (25%) / Savings (25%) with the special-case treatment of the Savings category.

## Slices

#### 4.1: Dashboard route + chart-lib decision + 50/25/25 widget `[PR]`

**Type**: Foundation
**Depends on**: 2.*

Sets up `/dashboard`, chooses the chart library (with ADR), and ships the
first chart — the 50/25/25 progress bar — as a pattern for the fan-out
slices to follow.

##### Tasks

- [ ] Decide chart library: Recharts vs Tremor vs visx — write ADR
- [ ] Install chosen library
- [ ] Create `/dashboard` route (server component, auth-gated)
- [ ] Base 4-card grid layout
- [ ] `50/25/25` progress widget: three bars (Essentials / Discretionary / Savings) with target lines
- [ ] `getMonthBudgetBuckets(userId, monthYear)` service: returns `{ essentials, discretionary, savings, income }` using the bucket logic from `domain-reference.md §1`
- [ ] Tests: bucket computation, widget render

---

#### 4.2: By-category donut chart `[PR]`

**Type**: Parallel (with 4.3, 4.4)
**Depends on**: 4.1

Donut chart breaking down spend by main category.

##### Tasks

- [ ] `CategoryDonutChart` component using chosen lib
- [ ] Reads from `getMonthSummary.byCategory` (already exists from 2.1)
- [ ] Hover: tooltip with category name + total + % of month
- [ ] Color palette consistent with card colors (per [domain-reference.md §4](../reference/domain-reference.md))
- [ ] Tests: render with mocked data, tooltip behavior

---

#### 4.3: By-card bar chart `[PR]`

**Type**: Parallel (with 4.2, 4.4)
**Depends on**: 4.1

Horizontal bar chart of spend per card for the month.

##### Tasks

- [ ] `getMonthSpendByCard(userId, monthYear)` service
- [ ] `CardBarChart` component
- [ ] Card colors from `domain-reference.md §4` (gray, yellow, purple, blue, green)
- [ ] Tooltip: card name + total + count of expenses
- [ ] Tests: service unit, chart render

---

#### 4.4: Month picker propagating to all charts `[PR]`

**Type**: Parallel (with 4.2, 4.3)
**Depends on**: 4.1

Single month picker on dashboard; all charts re-fetch when changed.

##### Tasks

- [ ] `DashboardMonthPicker` component
- [ ] URL param sync (`?month=2026-05`)
- [ ] All charts re-fetch on month change (server components re-render via param)
- [ ] Defaults to current month (CDMX local)
- [ ] Tests: URL sync, default behavior

---

#### 4.5: Subcategory drilldown + e2e `[PR]`

**Type**: Integration
**Depends on**: 4.2

Click a category in the donut → modal/drawer shows its subcategory totals.

##### Tasks

- [ ] `getSubcategoryBreakdown(userId, monthYear, categoryId)` service
- [ ] `SubcategoryDrilldownDrawer` component (drawer or modal — UI decision)
- [ ] Wire donut click handler → open drawer for clicked category
- [ ] Table inside drawer: subcategory name + spent + count
- [ ] Playwright e2e: navigate to dashboard → click "Housing" in donut → verify subcategories appear with correct totals
- [ ] Tests: service unit, drawer render
