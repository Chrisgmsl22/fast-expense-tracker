# Phase 3: Recurring

**Status**: 🔒 Locked (Phase 2 must ship first — uses Settings page)
**Outcome**: Mark expenses as recurring; month-rollover modal offers to clone them into the new month.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 3](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→Fan-out→I

Recurring is a *monthly* workflow (vs. the *weekly* settlement workflow in
Phase 2). The user marks fixed bills (rent, services, subscriptions) as
recurring; when the next month rolls over, the app offers to clone them
with one click.

`isRecurring` is already on the Expense schema (added in 1.1). The
`recurringPromptSuppressed` field is on Settings (added in 1.1). This
phase adds the UI hooks + month-rollover logic.

## Slices

#### 3.1: "Recurring?" checkbox + badge `[PR]`

**Type**: Foundation
**Depends on**: 1.4, 1.5, 1.6

Adds the UI surfaces — checkbox in capture/edit form, badge in list rows.
Small and unblocks the rest.

##### Tasks

- [ ] Add "Recurring?" checkbox to `ExpenseForm` (off by default)
- [ ] Update Zod schema in `lib/schemas/expense.ts` to accept `isRecurring`
- [ ] Pass `isRecurring` through `createExpense` and `updateExpense` server actions
- [ ] "Recurring" badge on list rows where `isRecurring = true`
- [ ] Tests: form submits with checkbox, badge renders correctly

---

#### 3.2: `getRecurringForCloning` + month-rollover detection `[PR]`

**Type**: Parallel (with 3.3)
**Depends on**: 3.1

Server util to fetch the previous month's recurring rows + the
client-side detection logic for "first-time visit to a new month."
Resolves the **last-prompted-month tracking** open question (spec §8).

##### Tasks

- [ ] `getRecurringForCloning(userId, prevMonth)` service: returns previous month's `isRecurring = true` rows
- [ ] Decide last-prompted-month tracking mechanism — write ADR if non-trivial:
  - Option: `Settings.lastPromptedMonth` field (single source of truth)
  - Option: Separate `MonthPromptLog` table (history of prompts)
  - Option: Local-storage key (per-device)
- [ ] Implement chosen mechanism
- [ ] Client hook to detect navigation to a month not yet prompted
- [ ] Tests: service unit, hook behavior

---

#### 3.3: "Don't show again" + Settings re-enable `[PR]`

**Type**: Parallel (with 3.2)
**Depends on**: 2.2

`Settings.recurringPromptSuppressed` already exists. This slice surfaces
it in the Settings page as a toggle.

##### Tasks

- [ ] Add "Recurring expense prompts" toggle to Settings page
- [ ] Wire to `Settings.recurringPromptSuppressed`
- [ ] Persist via existing `updateSettings` server action
- [ ] Inline help text: "When this is on, the month-rollover prompt won't appear. Turn off to re-enable."
- [ ] Tests: toggle updates Settings; reflected on next page load

---

#### 3.4: Modal + clone logic + animation + e2e `[PR]`

**Type**: Integration
**Depends on**: 3.2, 3.3

The user-visible modal + the cloning behavior + the e2e test.

##### Tasks

- [ ] `RecurringPromptModal` component with `[Add them]` · `[Skip]` · `[Don't show again]`
- [ ] Modal triggered when 3.2's hook detects an unprompted month with previous-month recurring rows AND `Settings.recurringPromptSuppressed = false`
- [ ] `cloneRecurringExpenses(userId, targetMonth)` server action — clones with `date` shifted +1 month (last-day clamping for 28-31 case)
- [ ] After action: mark month as prompted (per 3.2's mechanism)
- [ ] Reveal animation: subtle stagger or fade as rows appear in list
- [ ] Playwright e2e: log recurring expense in May → navigate to June → verify modal → click Add → verify cloned row → verify date is June with same day-of-month
- [ ] E2E case: also verify "Don't show again" hides modal across month boundaries
- [ ] Tests: clone logic with date-shifting edge cases (Jan 31 → Feb 28, etc.)
