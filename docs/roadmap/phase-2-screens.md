# Phase 2: Confirmed Designs V1 — screen build-out

**Outcome**: The app's real screens, built to the validated designs — capture/list re-skinned, the Income model + screen, the Dashboard (post-login landing), Category detail, and the Settlement + card-payment (`Movement`) flow.
**Visual spec**: [`docs/designs-screens/`](../designs-screens/README.md) (`Confirmed designs V1`) — **the source of truth**. The per-screen **scope + build order** is [`ui-build-plan.md`](./ui-build-plan.md); each slice below maps to one screen there.
**Why this replaced the old "Weekly Review" phase**: the original 2.x/4.x widget decomposition was written before the designs existed. The designs reorganize that work screen-by-screen, so Phase 2 was re-sliced and the old Phase 4 (Dashboard) was absorbed here. See [ADR-0013](../decisions/0013-screen-driven-reslice.md).

**Slicing note**: this phase is a **sequential screen build-out**, not the classic Foundation→Fan-out→Integration shape — deps encode the design's build order (`ui-build-plan.md`). Only the two re-skins (2.1 ∥ 2.2) are parallel-capable (cap 2, [`parallel-slicing.md`](../conventions/parallel-slicing.md)); the rest run one screen at a time.

Each slice's Plan block (Scope in/out + acceptance) is written when it goes next-up, per [`slice-planning.md`](../conventions/slice-planning.md) — read its `ui-build-plan.md` section + the screen's `Confirmed designs V1` screenshot first.

## Slices

#### 2.1: Add-expense re-skin `[PR]`

Re-skin the capture modal (slice 1.4 + edit from 1.6) to [`ui-build-plan.md §2`](./ui-build-plan.md). Field order per design, subcategory cascades from category, card-color dots, live "your share $X" on shared. No new backend. **Build after 1.6** so edit mode is re-skinned once, not twice.

##### Tasks

- [x] Add `dialog`, `select`, `checkbox` shadcn primitives (Base UI)
- [x] Re-skin `ExpenseForm` (field order, large amount, cascade, card dots, shared checkbox + live share at the configured split)
- [x] Read `Settings.defaultSharePercentage` in the page; thread it as `defaultSharePercentage`
- [x] Migrate Add + Edit + Delete modals to the `Dialog` primitive (desktop dialog / mobile sheet)
- [x] Thread `color` through `CategoryOption`/`CardOption` + the page query; scope the card query by `userId`
- [x] Tests (cascade, shared toggle, edit preservation, primitives) + update existing form + list tests
- [x] Reviewer loop + real-browser check vs screenshots

#### 2.2: Expenses re-skin `[PR]`

Re-skin the list (slice 1.5 + 1.6) to [`ui-build-plan.md §3`](./ui-build-plan.md). Category filter chips, category pill + card-dot cells, charged/my-share amounts, Charged/My-share footer; mobile pinned total bar. Card-payment rows deferred to 2.6 (`Movement` UI). **Also lands the card-color → brand-hex fix** (carried from 2.1).

##### Tasks

- [x] Repo: `ExpenseListItem` + `getForMonth` add `category.id`/`category.color` + `card.color`; update the integration test
- [x] Card-color hex: brand-hex `CARD_SEED` + seed updates existing card colors on re-run; seed test
- [x] Re-skin the list — filter chips + category pills + card dots + charged/my-share amounts + footer (desktop)
- [x] Mobile — stacked rows + pinned "Total spent · <month>" bar
- [x] Tests (chip filter, footer totals over filter, my-share/not-shared, stale-filter reset)
- [x] Reviewer loop + real-browser check vs screenshots

#### 2.3: Income model + Income screen `[PR]`

The one real data gap. Adds the `Income` model (`FIXED` recurring + `VARIABLE` per-month) + migration and the Income screen ([`ui-build-plan.md §4`](./ui-build-plan.md)): eye/privacy toggle, 3 stat cards, variable-income log. Establishes `getMonthlySummary` as the income source 2.4's dashboard reads instead of the `Settings.monthlyIncome` stopgap. Foundation for 2.4 (budget targets = `totalIncome × {0.5, 0.25, 0.25}`).

#### 2.4: Dashboard `[PR]`

New `/dashboard` route — the post-login landing ([`ui-build-plan.md §5`](./ui-build-plan.md)). Buckets hero (Essentials/Discretionary/Savings; Savings is its own bucket per CLAUDE.md), radar (Recharts, top ~5 categories), spend-by-card stacked bar, categories grid vs `Category.monthlyBudget`, right-rail month feed. New `getDashboardSummary(userId, month)` (totals via `actualExpenditure`). Card-payment rail lines deferred to 2.6.

#### 2.5: Category detail `[PR]`

Route `/category/[slug]` ([`ui-build-plan.md §6`](./ui-build-plan.md)). Headline is **spend-by-subcategory** (one bar per subcategory, high→low); stat cards (Spent my-share / Limit / Remaining), over/under badge, then the category's expenses showing each row's subcategory.

#### 2.6: Settlement + `Movement` / card-payment UI + e2e `[PR]`

Route `/settlement` ([`ui-build-plan.md §7`](./ui-build-plan.md)) — the phase capstone. Week range, 3-step flow (charged → partner gives 32% cash → you pay the card full), "true cost (68%)" + Mark settled. **Lands the `Movement` / card-payment UI** (blue "+ Card payment" lines) that Expenses (2.2) and Dashboard (2.4) reference. Playwright e2e proving the flow.

#### 2.7: Card management `[PR]`

Add / edit / delete the user's cards (name + color + type) — surfaced from slice 2.1, where the capture form revealed cards are per-user rows with no management UI. **Design pending** (no Confirmed-designs-V1 screen yet); parallel-capable (deps: card model from 1.1 only), so a parallel agent can pick it up independently of the screen sequence. Resolves the "cards should be dynamic" follow-up.

## Open questions (resolve in the owning slice)

Carried from [`ui-build-plan.md`](./ui-build-plan.md): eye-toggle scope (→ 2.3), settlement rollup (→ 2.6), category-color palette lock, Savings-vs-Investments bucket (→ 2.4). **No dedicated Settings screen exists in V1** — the recurring-prompt-suppression setting (slice 3.3) and budget-editing UI need a settings surface that the designs don't yet specify; decide when those slices go next-up.
