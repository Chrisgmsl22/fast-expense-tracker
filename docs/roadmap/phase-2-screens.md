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

Adds **Recharts**. "Where the money went" **radar** (top ~5 categories by my-share spend) + **spend-by-card** stacked bar + legend (per-card totals). Extends the read-model with its own aggregation: `getCardSpends` (per-card my-share, Cash rollup for null-card, stable id) + a pure `topCategories` helper (drops zero-spend + unassigned); `getCategorySpends` now carries name/color for the radar.

#### 2.4c: Dashboard categories grid + right-rail feed `[PR]`

**Categories grid** (per-category card: dot + spent + Progress vs `Category.monthlyBudget`, null → "no limit", over → danger, "N of M subcats") + **right-rail month feed** (the month's expenses + Charged/My-share footer). Reworks the page into the design's two-column layout (main + right rail), stacking on mobile. Reads the 2.4a summary + a new category-budget breakdown + `getForMonth`. Card-payment feed lines → 2.6; category→detail link → 2.5; mobile-exact reflow (compact buckets, FAB) → Phase 6.

#### 2.5: Category detail + per-month budgets `[PR]`

Route `/category/[slug]` ([`ui-build-plan.md §6`](./ui-build-plan.md)): a **spend-by-subcategory** headline (one bar per subcategory, high→low, zero-spend faint), stat cards (Spent my-share / Monthly limit / Remaining), an over/under badge, the category's expenses, and a **distinct mobile hero**. **Also lands per-month category budgets** ([ADR-0016](../decisions/0016-per-month-category-budgets.md)): a pencil on the limit edits _this month_ + the _default_, resolved (`override ?? default`) on both this screen and the dashboard grid.

##### Tasks

- [x] Pure domain `subcategoryBreakdown` + `budgetForMonth` + unit tests
- [x] `CategoryRepository` (getBySlug / getSubcategorySpends / getExpensesForCategoryMonth) + integration tests; wired into the composition root
- [x] `CategoryBudget` model + migration; `CategoryBudgetRepository` with an atomic `setBudget` (single `$transaction`) + integration tests (ADR-0016)
- [x] `getCategoryDetail` service (resolves the per-month limit) + `setCategoryBudget` action + Zod + unit tests
- [x] Dashboard grid resolves the per-month override (`getCategoryBreakdown`)
- [x] Route + components (header / stats / progress / breakdown / expenses / mobile hero / `CategoryLimitEditor`) + component tests
- [x] Drill-in link from `CategoriesGrid` (threads `month`)
- [x] Reviewer loop + real-browser check vs screenshots (desktop + mobile hero + edit flow)

#### 2.6: Money movements — card-payment + partner-transfer journal + e2e `[PR]`

Reframed from the retired 3-step settlement ritual to a **personal money-movement
journal** — see [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md).
Lands the `Movement` / card-payment UI (blue lines) that Expenses (2.2) and
Dashboard (2.4) reference, plus partner-transfer logging, colour-coded feeds, and
the two-numbers footer.

Partner name lives in `lib/partner.ts` (`PARTNER_NAME`, currently "Brenda") — a single source, no hardcoded "girlfriend" copy in the new UI.

#### 2.7: Card management `[PR]`

Add / edit / delete the user's cards (name + color + type) — surfaced from slice 2.1, where the capture form revealed cards are per-user rows with no management UI. **Design pending** (no Confirmed-designs-V1 screen yet); parallel-capable (deps: card model from 1.1 only), so a parallel agent can pick it up independently of the screen sequence. Resolves the "cards should be dynamic" follow-up.

#### 2.8: Global privacy toggle `[PR]`

Make the eye/privacy toggle **app-wide** — a persisted `PrivacyProvider` masking money (`$ ••••••`) across the dashboard income chip, the Income screen, dashboard totals, and (optionally) expenses, driven by one toggle. **Reverses the 2.3 income-only decision** (open-Q #1) now that the app is dashboard-centric and income lives at the top. Depends on 2.4a (the dashboard/income surfaces to mask).

#### 2.10: Savings as allocation (not spend) `[PR]`

Savings is a **transfer** (money moved to your savings, still yours), not consumption — so it should stop behaving like a spend. Money still _left_ checking, so it keeps reducing "remaining." Excluded from Spent/radar/spend-by-card; the card field is disabled on savings capture; the feed footer splits into Charged · My share · Set aside · Total.

#### 2.11: Mobile foundation `[PR]`

The app was desktop-first and unusable on a phone (zoom-out "mini desktop", horizontal scroll, overflowing nav, uneditable fixed income). Pulls the mobile **fundamentals** forward from Phase 6's audit ([ADR-0017](../decisions/0017-mobile-foundation.md)); Phase 6 keeps the richer polish (FAB, optimistic UI, PWA, capture-split, e2e sweep).

##### Tasks

- [x] Viewport export (`width=device-width, initialScale 1, minimumScale 1`; later `maximumScale 1` — zoom locked, see ADR-0017 + `fix/ios-input-zoom`)
- [x] `overflow-x: clip` (+ `overflow-y: visible`) backstop — kills horizontal scroll while preserving desktop `lg:sticky`; 390px offender audit (fixed the dashboard topbar overflow)
- [x] `Sheet` primitive + `AppNav` (burger drawer on mobile / inline row on desktop, active-link highlight) + tests
- [x] Fixed-income editable on mobile + test
- [x] Reviewer loop + real-browser pass (390px no-scroll + desktop sticky re-verified)

#### 2.9: Settings screen `[PR]` — low priority

Route `/settings` — the settings surface the V1 designs lacked. Design: [`designs-screens/Settings.html`](../designs-screens/Settings.html) (HTML-only, authoritative). Covers budget/**monthly-income** editing + the **68/32 split** (`Settings.defaultSharePercentage`), **per-category budgets** (`Category.monthlyBudget`), and **currency**. Acts as the **shell** that surfaces card management (2.7) and the privacy toggle (2.8) — those may land within it or link to it. **Not high priority**; slot after the core screens (dashboard/category/settlement). Also the natural home for the recurring-prompt-suppression setting (slice 3.3).

#### 2.12: Settlement / couple balance `[PR]` — brainstorm on pickup

Brings back a **settlement surface** with a **two-sided net balance** — the piece 2.6 deliberately deferred (2.6 removed the one-sided "{partner} owes you" reminder; this supersedes [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md) §4). Depends on 2.6 (`Movement` journal + `fundedByPartner`).

**The agreed model** (confirmed with the user 2026-07-06 — the full design/ADR is written when this slice is picked up):

- A single running **balance**:
  `balance = (her 32% share of the shared expenses YOU logged) − (what you log as "I owe {partner}") − (money she's paid you: gf_received / funded-by-her card payments) + (money you've paid her: gf_paid)`.
  Positive → she owes you; negative → you owe her; **0 → settled** (bar empty).
- The **one new concept**: an **"I owe {partner}" entry** — a lump debt you log (your share of stuff she fronted, un-itemized), since the app never tracks her receipts. It nets against what she owes you; a real `gf_paid`/`gf_received` then clears the balance.
- Reuses `partnerShareTotal` (`lib/domain/movement.ts`) for the "she owes you" side; the `fundedByPartner` flag + `gf_received`/`gf_paid` movements already exist.
- Worked scenarios (all settle to 0): she owes 1000, pays 1000 → 0 · she owes 1000, you owe 300 → she pays 700 → 0 · she owes 500, you owe 700 → you pay 200 → 0.

**Open questions for the brainstorm:** dedicated `/settlement` route vs a dashboard widget; where the "I owe {partner}" entry is logged (Add menu? the settlement surface?); whether that logged debt should also feed "What I really spent" (it's arguably your cost) or stay balance-only; how `income`/`other` movements fit. **Scope out:** itemising the partner's expenses (still never tracked); auto-settlement.

#### 2.13: Per-card outstanding balance `[PR]` — backlog

Surfaces the **per-card outstanding** stat deferred since [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md) (formula in [spec 0003 §4.4](../specs/0003-shared-expense-settlement.md)): `outstanding = Σ(charges you paid on that card) − Σ(card_payments to that card)`. The raw data already exists — expenses carry `cardId` + `paidBy`, card payments carry `cardId` — so this is a read-model + display slice, no new capture. **Accuracy is logging-completeness-bound**: correct only if every charge is logged (the user commits to this), and labelled "based on logged expenses," not the bank statement (no statement import — spec 0003 §7). Depends on 2.6 (`card_payment` movements). Design pending — brainstorm the surface (dedicated card view vs dashboard widget vs settlement page) on pickup.

## Navigation model (decided 2026-07-01)

**Dashboard-as-hub + nav + drill-in.** `/dashboard` is the home/landing; a top nav links each screen (Dashboard / Expenses / Income); **and** clicking a section _on_ the dashboard drills into its detail screen (category card → `/category/[slug]` (2.5); Total income chip → income popover/`/income`; month-feed → expenses). The chip's income **popover** (add-inline) is deferred (2.4a ships a static Total-income chip); income capture lives on the Income screen (2.3) meanwhile.

## Open questions (resolve in the owning slice)

Carried from [`ui-build-plan.md`](./ui-build-plan.md): ~~eye-toggle scope~~ (**resolved → global, slice 2.8**), settlement rollup (→ 2.6), category-color palette lock, Savings-vs-Investments bucket (**resolved → one "Savings/Inv" bucket, slice 2.4a**). **A Settings screen design now exists** ([`designs-screens/Settings.html`](../designs-screens/Settings.html), added 2026-07-01) — covers budget/monthly-income + 68/32 split, card management, per-category budgets, privacy, currency. It's the home for the recurring-prompt-suppression setting (slice 3.3), budget-editing UI, card management (2.7), and the privacy toggle (2.8). Not yet sliced as its own screen build; fold pieces in via those slices or scope a dedicated Settings slice when picked up.
