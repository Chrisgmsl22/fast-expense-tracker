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

### 2.4: Dashboard — split into 3 mini-slices `[PR×3]`

New `/dashboard` route — the post-login landing ([`ui-build-plan.md §5`](./ui-build-plan.md)). Sliced into three independently-mergeable PRs so the diff stays reviewable; each leaves the page shippable. Card-payment rail lines + budget-editing UI deferred to 2.6/later.

#### 2.4a: Dashboard foundation — service + shell + buckets + stat strip `[PR]`

`getDashboardSummary(userId, month)` aggregation (totals via `actualExpenditure`) + the `/dashboard` route + topbar (month nav, Total income chip, "My view · 68%", + Add) + post-login landing change (`/expenses` → `/dashboard`). Renders the **buckets hero** (Essentials/Discretionary/Savings — colored top border, amount, "of $X · $Y left", Progress; over → danger) + the **stat strip** (Income in / Spent my-share / Net so far / Daily avg · N left). Bucket classification (CLAUDE.md): Essentials = `isRelevant` − Savings; Discretionary = non-relevant − Unassigned; **Savings = its own bucket** ("Savings/Inv" = one bucket, resolves open-Q #4). Foundation 2.4b/2.4c hang off.

#### 2.4b: Dashboard charts — radar + spend-by-card `[PR]`

Adds **Recharts**. "Where the money went" **radar** (top ~5 categories by my-share spend) + **spend-by-card** stacked bar + legend (per-card totals). Reads from the 2.4a summary; no new backend.

#### 2.4c: Dashboard categories grid + right-rail feed `[PR]`

**Categories grid** (per-category card: dot + spent + Progress vs `Category.monthlyBudget`, null → "no limit", over → danger, "N of M subcats", links to 2.5 detail) + **right-rail month feed** (the month's expenses + Charged/My-share footer; card-payment lines still deferred to 2.6) + the mobile dashboard layout (compact buckets, categories list, recent feed, FAB). Reads from the 2.4a summary + `getForMonth`.

#### 2.5: Category detail `[PR]`

Route `/category/[slug]` ([`ui-build-plan.md §6`](./ui-build-plan.md)). Headline is **spend-by-subcategory** (one bar per subcategory, high→low); stat cards (Spent my-share / Limit / Remaining), over/under badge, then the category's expenses showing each row's subcategory.

#### 2.6: Settlement + `Movement` / card-payment UI + e2e `[PR]`

Route `/settlement` ([`ui-build-plan.md §7`](./ui-build-plan.md)) — the phase capstone. Week range, 3-step flow (charged → partner gives 32% cash → you pay the card full), "true cost (68%)" + Mark settled. **Lands the `Movement` / card-payment UI** (blue "+ Card payment" lines) that Expenses (2.2) and Dashboard (2.4) reference. Playwright e2e proving the flow.

#### 2.7: Card management `[PR]`

Add / edit / delete the user's cards (name + color + type) — surfaced from slice 2.1, where the capture form revealed cards are per-user rows with no management UI. **Design pending** (no Confirmed-designs-V1 screen yet); parallel-capable (deps: card model from 1.1 only), so a parallel agent can pick it up independently of the screen sequence. Resolves the "cards should be dynamic" follow-up.

#### 2.8: Global privacy toggle `[PR]`

Make the eye/privacy toggle **app-wide** — a persisted `PrivacyProvider` masking money (`$ ••••••`) across the dashboard income chip, the Income screen, dashboard totals, and (optionally) expenses, driven by one toggle. **Reverses the 2.3 income-only decision** (open-Q #1) now that the app is dashboard-centric and income lives at the top. Depends on 2.4a (the dashboard/income surfaces to mask).

## Navigation model (decided 2026-07-01)

**Dashboard-as-hub + nav + drill-in.** `/dashboard` is the home/landing; a top nav links each screen (Dashboard / Expenses / Income); **and** clicking a section _on_ the dashboard drills into its detail screen (category card → `/category/[slug]` (2.5); Total income chip → income popover/`/income`; month-feed → expenses). The chip's income **popover** (add-inline) is deferred (2.4a ships a static Total-income chip); income capture lives on the Income screen (2.3) meanwhile.

## Open questions (resolve in the owning slice)

Carried from [`ui-build-plan.md`](./ui-build-plan.md): ~~eye-toggle scope~~ (**resolved → global, slice 2.8**), settlement rollup (→ 2.6), category-color palette lock, Savings-vs-Investments bucket (**resolved → one "Savings/Inv" bucket, slice 2.4a**). **No dedicated Settings screen exists in V1** — the recurring-prompt-suppression setting (slice 3.3) and budget-editing UI need a settings surface that the designs don't yet specify; decide when those slices go next-up.
