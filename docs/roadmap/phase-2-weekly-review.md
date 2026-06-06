# Phase 2: Weekly Review

**Outcome**: Summary numbers + category rollup + settlement workflow + settings page. The Monday-morning review ritual works in the app.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 2](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out→I

This phase makes the app _useful_. After Phase 1 you can log expenses;
after Phase 2 you can do your full weekly review (totals + settle-up with
girlfriend) entirely in the app.

The Settings model is already in the schema from slice 1.1. This phase
lands the Settings page UI + the `getMonthSummary` server util that
multiple fan-out slices depend on.

## Slices

#### 2.1: `getMonthSummary` util + summary header shell `[PR]`

Lands the shared server util + the page shell that fan-out slices fill in.
Small but unblocks everything.

##### Tasks

- [ ] `getMonthSummary(userId, monthYear)` service returns `{ spent, saved, remaining, owed, byCategory[] }`
- [ ] Types in `types/summary.ts`
- [ ] `SummaryHeader` component shell inserted into `/expenses` page
- [ ] Skeleton placeholders for: Spent / Saved / Remaining / Owed-to-you cards
- [ ] Tests: service unit (computes totals correctly with mocked Prisma)

---

#### 2.2: Settings page UI `[PR]`

Builds the Settings page form for monthlyIncome, defaults, per-category
budgets, and email day.

##### Tasks

- [ ] `/settings` page form: monthlyIncome, defaultSharePercentage
- [ ] Per-category `monthlyBudget` inputs (table view, one row per category)
- [ ] `emailDay` selector (Sun-Sat, defaults to Monday)
- [ ] `updateSettings` server action
- [ ] Zod schema validation (income > 0, percentage in [0,1], etc.)
- [ ] Tests: schema validation, server-action paths

---

#### 2.3: Top-line summary widget `[PR]`

Three top-line cards: Spent / Saved / Remaining.

##### Tasks

- [ ] `SpentCard`, `SavedCard`, `RemainingCard` components
- [ ] Read from `getMonthSummary`
- [ ] Format MXN values per coding conventions
- [ ] Updates when month filter changes
- [ ] Tests: component render with mocked data

---

#### 2.4: Category rollup table `[PR]`

Table showing main-category totals (subcategory drilldown deferred to Phase 4).

##### Tasks

- [ ] `CategoryRollupTable` component
- [ ] Reads from `getMonthSummary.byCategory`
- [ ] Highlights over-budget categories (compare to `Category.monthlyBudget`)
- [ ] Tests: render, over-budget highlighting

---

#### 2.5: Settlement auto-defaults + badges + "Owed to you" `[PR]`

Wires the settlement workflow into the existing capture/edit + list.

##### Tasks

- [ ] `createExpense` / `updateExpense`: auto-default `settlementStatus` based on `isShared` (per spec §3 Settlement convention)
- [ ] List view row: "Pending settlement" amber badge for `settlementStatus = "pending"`
- [ ] List view row: "Settled · paid <date>" muted badge for `settlementStatus = "settled"`
- [ ] `OwedToYouCard` component in SummaryHeader
- [ ] Computes `sum(amount − actualExpenditure)` where `settlementStatus = "pending"`
- [ ] Tests: auto-default logic, badge rendering, owed computation

---

#### 2.6: Settle-up modal + e2e `[PR]`

The bulk-select modal + the e2e test that proves the weekly review flow works.

##### Tasks

- [ ] `SettleUpModal` component: list of pending shared expenses with checkboxes
- [ ] [Select all] toggle
- [ ] `settleExpenses(expenseIds[])` server action — sets `settlementStatus = "settled"`, `paidAt = now()` in a transaction
- [ ] Modal triggered from "Settle up" button on `OwedToYouCard`
- [ ] Playwright e2e: create shared expense → verify "Owed to you" shows it → settle up → verify "Owed to you" drops
- [ ] Tests: bulk update server action
