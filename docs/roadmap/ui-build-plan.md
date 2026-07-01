# UI Build Plan — Confirmed designs V1

The screen-by-screen plan for building the app's UI to the validated designs.
**Source of truth:** [`docs/designs-screens/`](../designs-screens/README.md) —
`Confirmed designs V1` (+ the per-screen PNGs in `screenshots/`). This doc is the
**order + scope**; the design files are the **visual spec**.

Each screen below is **its own slice / PR**, now tracked in
[`slices.json`](./slices.json) as **Phase 2** (`2.1`–`2.6`; Login shipped as `1.10`) —
see [ADR-0013](../decisions/0013-screen-driven-reslice.md). Write the formal Plan
block ([`slice-planning.md`](../conventions/slice-planning.md)) when a screen is
picked up; the manifest entry already exists.

## What's already in place (foundation, slice 1.9)

- **Theme tokens** — shadcn base set + semantic (`positive`/`danger`/`payment`) +
  bucket (`essentials`/`discretionary`/`savings`) color systems. Light only (ADR-0010).
- **`Category.color`** — per-category hex (category dots/pills).
- **Data utilities** — `lib/dates` (CDMX month math), `lib/format` (`formatMxn`,
  `formatExpenseDate`), `getExpensesForMonth`.

**Conventions for every screen below:** map visuals to **shadcn/ui on Base UI**
(add primitives per-screen — don't hand-roll Card/Badge/Select/Dialog/Switch/
Progress/Popover/Table/Tabs), **lucide** icons, the **color systems** carried
through exactly, **charts via Recharts** (radar) + CSS/divs (bars/progress).
Lofi → apply the Tailwind theme for final styling.

## Build order

1. **Login** (re-skin) → 2. **Add expense** (re-skin) → 3. **Expenses** (re-skin)
   → 4. **Income model + Income screen** (data foundation) → 5. **Dashboard**
   → 6. **Category detail** → 7. **Settlement** (lands the card-payment / `Movement` UI).

Rationale: re-skin the shipped P1 screens first (no new data), then the `Income`
model (unblocks budget targets), then the dashboard, then the remaining new screens.

## How each slice is built (execution model)

So implementers never have to guess:

- **Vertical slices — FE + backend together in ONE PR.** Each screen-slice ships
  everything it needs in a single PR: the page/components (shadcn + tokens) **and**
  its backend (server actions, services, Zod schemas, Prisma schema + migration)
  **and** tests. We do **not** split front-end and back-end into separate PRs.
  (See [`pr-strategy.md`](../conventions/pr-strategy.md) + `coding-conventions.md`.)
- **What backend each slice carries** — each screen's **Scope (in)** + **Prereqs**
  below are authoritative:
    - **Re-skins** (Login, Add expense, Expenses): backend already shipped → mostly
      FE; no new model/migration.
    - **Income, Dashboard, Settlement**: real backend (new `Income` model + migration,
      `getDashboardSummary` service, `Movement` / card-payment UI) bundled with the FE.
- **Sequential**, in the build order above — dependencies forbid reordering
  (Income before Dashboard; the `Movement` UI lands with Settlement). One screen at
  a time. Independent re-skins _may_ run in parallel (cap 2, `parallel-slicing.md`),
  but default to sequential.
- **Per-slice flow:** pick the next screen → implementer reads the screen's
  **HTML in `Confirmed designs V1.standalone.html` (authoritative for exact
  colors/borders/spacing — grep it), cross-checked with the `screenshots/` PNG
  for layout** (see [`designs-screens/README.md` §Reading the designs](../designs-screens/README.md)) + this doc's section + any referenced ADR → writes a
  **Plan block** ([`slice-planning.md`](../conventions/slice-planning.md): Scope
  in/out + acceptance) + a `slices.json` entry → implements end-to-end →
  **reviewer** loop incl. a real-browser check vs the screenshot → PR.
  (See [`agent-workflow.md`](../conventions/agent-workflow.md).)
- **Done =** matches the design screenshot (reviewer UI-fidelity lens) +
  `pnpm typecheck`/`lint`/`test` green + reviewer-approved + slice-lifecycle complete.

---

## 1. Login — re-skin (slice 1.10 — shipped)

- **Design:** `login-desktop.png` / `login-mobile.png`.
- **Type:** re-skin the shipped `/login` (slice 1.3) — keep all credentials logic
  (`loginAction`, `LoginForm`, route gate) and the disabled "Sign up / Coming soon".
- **Scope (in):** two-panel layout — dark brand panel left (5 card-color dots
  motif), form right; mobile = single dark column. shadcn inputs/labels + the
  primary button.
- **Out:** any auth behavior change; signup.
- **Prereqs:** none (foundation done).

## 2. Add expense — re-skin (slice 2.1)

- **Design:** `add-expense-desktop.png` / `add-expense-mobile.png`.
- **Type:** re-skin the capture modal (slice 1.4). Keep `createExpense` + Zod.
- **Scope (in):** field order per design (Date · Amount · Category · Subcategory ·
  Card · Description · Notes · Paid by · Shared); **subcategory options cascade
  from the chosen category**; card option shows a card-color dot (Cash green);
  shared → show `68/32` split + **live "your share $X"** as amount changes.
  Desktop = Dialog (2–3 col grid); mobile = full-screen sheet.
- **Out:** card payments.
- **Prereqs:** `Expense.subcategoryId` ✓.

## 3. Expenses — re-skin (slice 2.2)

- **Design:** `expenses-desktop.png` / `expenses-mobile.png`.
- **Type:** re-skin the shipped `/expenses` (slice 1.5) table.
- **Scope (in):** category **filter chips** (color dot + name; "All" = solid dark);
  **category pill** (own color) + **card dot** cells; amount = charged (bold) +
  green "my share $X" subtext, "not shared" grey; **Charged / My-share footer**.
  Mobile: rows + pinned dark "Total spent" bar.
- **Out / defer:** `+ Card payment` button + blue card-payment rows → comes with
  the `Movement` UI (slice 7).
- **Prereqs:** `Category.color` ✓.

## 4. Income model + Income screen — new (data foundation) (slice 2.3)

- **Design:** `income-desktop.png` / `income-mobile.png`.
- **Type:** **new** — the one real data gap. Adds the `Income` model + the screen.
- **Scope (in):** `Income` model (`FIXED` recurring + `VARIABLE` per-month) +
  migration; Income screen — eye/privacy toggle (mask to `$ ••••••`), 3 stat
  cards (Fixed monthly / Variable this month / Total), Variable income log table
    - "+ Add income"; **migrate the dashboard off `Settings.monthlyIncome`**.
- **Prereqs:** none new (creates the model). Resolves the Income-model follow-up.
- **Open Qs:** eye-toggle scope (income-only vs global) — see Open questions.

## 5. Dashboard — new (post-login landing) (slice 2.4)

- **Design:** `dashboard-desktop.png` / `dashboard-mobile.png`. New `/dashboard`,
  becomes the post-login landing; `/expenses` stays the list.
- **Scope (in):** topbar (month nav, **Total income** chip, "My view · 68%", - Add); **buckets hero** (Essentials/Discretionary/Savings — colored top border,
  amount, "of $X · $Y left", Progress; over → danger); **radar** (Recharts, top ~5
  categories); **spend-by-card** stacked bar + legend; **categories grid**
  (dot + Progress vs `monthlyBudget`, null → "no limit"); **right rail** (month
  expenses feed + Charged/My-share footer). New `getDashboardSummary(userId,
month)` service (totals use `actualExpenditure`).
- **Bucket classification (CLAUDE.md):** Essentials = `isRelevant` − Savings;
  Discretionary = non-relevant − Unassigned; **Savings = its own bucket**.
- **Out / defer:** card-payment rail lines (slice 7); income popover "add" (uses
  the Income screen from slice 4); budget-editing UI (separate).
- **Prereqs:** Income model (slice 4); `Category.monthlyBudget` ✓; Recharts.

## 6. Category detail — new (slice 2.5)

- **Design:** `category-detail-desktop.png` / `category-detail-mobile.png`. Route
  `/category/[slug]` (from a dashboard category card).
- **Scope (in):** colored title + `isRelevant` tag + over/under badge; 3 stat
  cards (Spent (my share) / Limit / Remaining — red when over); progress bar +
  "% of limit · N days left · N expenses across N subcategories"; **headline:
  "Spend by subcategory"** — one bar per subcategory (amount + % of category),
  high→low, zero-spend faint at end; then the category's expenses (each row shows
  its subcategory). Daily-spend chart optional/secondary.
- **Prereqs:** `Expense.subcategoryId` ✓ (spend-by-subcategory aggregation).

## 7. Settlement — new (+ card-payment / Movement UI) (slice 2.6)

- **Design:** `settlement-desktop.png` / `settlement-mobile.png`. Route `/settlement`.
- **Scope (in):** week range + prev/next; 3-step flow (charged → partner gives 32%
  cash → you pay the card full); highlighted "true cost (68%) $Z" + "Mark settled";
  list of that week's shared expenses ("you $a · partner $b"). **Lands the
  `Movement` / card-payment UI** (`+ Card payment`, blue highlighted lines) used
  back on Expenses (slice 3) + Dashboard (slice 5).
- **Prereqs:** `Movement` model ✓ (UI new); weekly-boundary logic.
- **Open Qs:** settlement rollup (one payment per card vs single weekly number).

---

## Open questions (resolve in the owning slice)

1. **Eye-toggle scope** (income-only vs global privacy) → slice 4 (Income).
2. **Settlement rollup** (per-card vs single weekly) → slice 7 (Settlement).
3. **Category colors** — lock the palette (current: seeded per-slug) vs user-pickable → slice 6 / a settings slice.
4. **Savings vs Investments** — one bucket or split inside the 25% → slice 5 (Dashboard) / domain.

## Relationship to the phase roadmap

These screen-slices supersede the widget-level decomposition the original Phase 2
(summary/rollup/settlement/settings) and Phase 4 (dashboard/charts/drilldown)
sketches assumed — the designs reorganize that work screen-by-screen. **That
reconciliation is done** ([ADR-0013](../decisions/0013-screen-driven-reslice.md)):
Phase 2 in `slices.json` is now these screens (`2.1`–`2.6`), and old Phase 4 is
retired. Per-slice Plan blocks are still written when each screen goes next-up.
Phases 3 (recurring), 5 (multi-currency), 6 (mobile polish), 7 (email) are
unaffected by this plan.
