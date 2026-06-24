# Handoff: Fast Expense Tracker — Dashboard, Expenses, Settlement, Income, Add

## Overview

A private, two-person expense tracker for a couple in Mexico City. Currency is **MXN**. It is mobile-first (ad-hoc capture on phone) and desktop-capable (weekly review on Monday). Core ideas:

- **50 / 25 / 25 budgeting** — income split into Essentials (50%), Discretionary (25%), Savings/Investments (25%).
- **68 / 32 shared split** — when an expense is _shared_, the payer fronts the full amount but only their **68% share** counts toward their budget. The app always surfaces "my share", never just the raw charge.
- **Per-category budget limits** — every category has its own monthly limit and its own mini chart.
- **Weekly card settlement** — partner reimburses their 32% in cash, you pay the full card statement; "true cost" (your 68%) is the budget number.
- **Income = global fixed + per-month variable** — fixed salary recurs every month; variable income (sold sneakers, freelance) is logged per month. A privacy "eye" toggle hides sensitive totals.

## Source of truth

- **V2 (merged direction)** — `Wireframes v2 (merged direction).standalone.html` — is the **source of truth for every screen** (dashboard, expenses, category detail, settlement, income, add expense). Open the standalone in a browser; the per-screen PNGs in `screenshots/` are the rendered reference.
- **Login is the exception — it follows V1**: `Wireframes v1 (A vs B).dc.html`. The login exists only in V1 (V2 has no login screen). Use the V1 login: desktop two-panel (dark brand panel left with the 5 card-color dots, form right); mobile single dark column.
- The **color systems** (card / bucket / category colors — see `screenshots/color-systems.png` + Design Tokens below) are authoritative and must be carried through. Greys/typography are placeholders — replace with the Tailwind theme.
- These are **lofi** references for layout / structure / flow / behavior — recreate them in the project stack (shadcn/ui on Base UI + Tailwind v4 + lucide); do not copy the wireframe HTML.

## About the Design Files

The files in this bundle are **design references created in HTML** — low-fidelity wireframes showing intended **layout, structure, flow, and data relationships**. They are **not production code to copy**. The task is to **recreate these designs in the target codebase** using its established stack and patterns:

- **Next.js 16 (App Router) + React 19 + TypeScript (strict)**
- **Tailwind CSS v4**
- **shadcn/ui components on Base UI (`@base-ui/react`)**
- **lucide-react** icons
- **Prisma + Neon Postgres**, **next-auth** sessions

Map every visual to shadcn primitives and Tailwind utilities. Do not hand-roll components that shadcn already provides (Card, Button, Badge, Select, Dialog, Switch, Checkbox, Tabs, Progress, Popover, Table, ScrollArea). Charts: the wireframes draw radar/bars inline as SVG — implement with a charting lib of your choice (e.g. **Recharts** or **visx**) or small custom SVG; the wireframe SVG is only a layout reference.

## Fidelity

**Low-fidelity (lofi).** Use these for **layout, hierarchy, component inventory, and behavior**. Apply your own/ shadcn design system for final styling (radii, shadows, spacing). The color _systems_ below (cards, buckets, categories) ARE intentional and should be carried through; the neutral greys/typography are placeholders — replace with your Tailwind theme.

## How to view the wireframes

- `Wireframes v2 (merged direction).standalone.html` — self-contained, **open directly in a browser** (no server needed). **V2 / source of truth.** Pannable canvas: scroll/drag to move, pinch/scroll to zoom. The income "Total income" chip and the income "eye" toggle are interactive — click them.
- `Wireframes v2 (merged direction).dc.html` — source of the above (depends on the project runtime; prefer the standalone for viewing).
- `Wireframes v1 (A vs B).dc.html` — earlier two-direction exploration. **Reference only for the screens that V2 merged — except the Login, which V2 dropped, so the V1 login is the design to build.**

---

## Screens / Views

### 1. Auth — Login

- **Source**: **V1 wireframe** (`Wireframes v1 (A vs B).dc.html`) — login is not in V2.
- **Purpose**: email + password sign-in; link to sign up.
- **Layout**: desktop = two-panel (dark brand panel left, form right). Mobile = single dark column, form stacked.
- **Components**: Email input, Password input, primary Sign in button (full-width on mobile), "No account? Sign up" link. Brand panel shows the 5 card-color dots as a motif.

### 2. Dashboard (the headline screen)

- **Purpose**: answer "where am I vs budget this month" at a glance; scan recent/all spend; jump to a category; see/add income.
- **Layout (desktop)**: two columns — main content (left) + a fixed **scrollable month-feed rail** (right, ~280px).
    - **Topbar**: `Month` label + prev/next arrows; a clickable **Total income** chip (opens a popover of income items with an "+ Add income" action); right side has a "My view · 68%" indicator and a "+ Add" button.
    - **Buckets hero**: 3 cards (Essentials / Discretionary / Savings·Inv), each with a colored top border, amount, "of $X · $Y left", and a Progress bar. Over-budget flips the value + bar to red/danger.
    - **Overall radar**: pentagon radar = the month's spending _shape_ across the top ~5 categories.
    - **Spend by card**: a single stacked horizontal bar in the 5 card colors + a small legend with per-card totals.
    - **Categories grid**: one card per category, each with its color dot, spent amount, a Progress bar vs **its own limit**, and "limit $X · $Y left" (or "over by $Z" in red). Tapping a card → Category detail.
    - **Right rail**: header ("All expenses · June · N entries"), a vertically **scrollable** list of every expense this month (each row: 3px category-color accent bar, description, "date · card-dot card", amount, green "share $X" subtext), and a pinned footer with "Charged" + "My share" totals. Card-payment lines appear here too (see Interactions).
- **Layout (mobile)**: compact. Month row + "My view" pill; tappable **Total income** chip that expands an inline income panel; a 3-up bucket strip (label + % only); a Categories list (each with its limit bar); a short "Recent" list; a floating **+** FAB bottom-right.

### 3. Category detail

- **Purpose**: one category's own dashboard.
- **Components**: back link + colored category title + over/under badge; 3 stat cards (Spent / Monthly limit / Remaining — Remaining negative & red when over); a wide Progress bar with "% of limit · N days left"; a **daily-spend bar chart** (bars tinted in the category color, peak days darker); a list of that category's expenses.

### 4. Expense list

- **Purpose**: review/filter all expenses for a CDMX-month boundary.
- **Layout (desktop)**: title + month nav + **"+ Card payment"** (outline, blue) + **"+ Add"** (solid). Category filter chips (each chip = category color dot + name; "All" selected = solid dark). Table columns: **Date · Description · Category · Card · Amount**.
    - **Category cell**: a tinted pill in the category's own color (dot + label).
    - **Card cell**: card-color dot + card name.
    - **Amount cell**: full charged amount (bold) + green "my share $X" subtext; non-shared rows show "not shared" in grey.
    - **Footer**: right-aligned "Charged $X" + "My share $Y".
- **Layout (mobile)**: title + month nav; two action buttons ("+ Add expense" solid, "+ Card payment" outline-blue); filter chips; expense rows (category accent bar, description, "date · card-dot card", amount + green "share" badge); a **pinned dark "Total spent" bar** at the bottom showing month total + my share.

### 5. Weekly settlement

- **Purpose**: make the weekly money movement unambiguous.
- **Components**: week range + prev/next; a **3-step flow**: `You charged to cards $X` → `Partner gives you (32%) $Y (cash)` → `You pay the card $X (full statement)`. Below: a highlighted **"Your true cost this week (68%) $Z"** with a "Mark settled ✓" button, then the list of shared expenses that week (each annotated "you $a · partner $b").

### 6. Income

- **Purpose**: manage the income that the 50/25/25 targets are derived from.
- **Components**: "Income" title + **eye toggle** (Hide/Show — masks all income figures to `$ ••••••`); 3 stat cards: **Fixed income · monthly** ("recurs every month"), **Variable · <month>** ("logged this month"), **Total · <month>** (fixed + variable, dark card). Then a **Variable income log** table: columns Date · Source · Amount(+green), with an "+ Add income" affordance / empty add row.

### 7. Add expense (the hot path)

- **Purpose**: near-frictionless capture; mobile-optimized.
- **Fields (exact, in order)**: **Date** (date picker, dd/mm/yyyy) · **Amount (MXN)** (large) · **Category** (select) · **Subcategory (optional)** (select, default None) · **Card** (select; option shows card-color dot, Cash default + green) · **Description** (text) · **Notes (optional)** (textarea) · **Paid by** (select: You / Partner) · **Shared expense** (checkbox; when on, shows split `68 / 32` and a **live "your share $X"** computed from Amount). Primary action: "Add expense". Mobile = full-screen sheet; desktop = modal (Dialog) with fields in a 2–3 column grid.

---

## Interactions & Behavior

- **Total income chip (dashboard)**: click/tap toggles a Popover (desktop) / inline panel (mobile) listing income items + "+ Add income".
- **Income eye toggle**: toggles a boolean that masks income amounts to `$ ••••••`. Decide whether this is income-only or a global privacy switch (see Open questions).
- **Card payment**: "+ Card payment" logs a payment to a card. It renders as a **blue highlighted line** (left accent + light-blue background, banknote icon, "Payment" tag, `−$amount`, "paid to card") in **both** the expense list and the dashboard month-feed, so a payment is never counted as spend. Payments do **not** change spend/share totals.
- **Shared toggle (add expense)**: on → counts 68% toward budget; live-recompute "your share" = `amount * 0.68` as the amount changes.
- **Over-limit**: any category/bucket past its limit flips value + progress bar to a danger color and shows "over by $X".
- **Month navigation**: prev/next arrows re-scope all data to that month (CDMX/Mexico-City month boundaries — be careful with timezone: compute month start/end in `America/Mexico_City`).
- **Category card → Category detail** navigation.
- **Mark settled** on the settlement screen flips that week to a settled state.

## State Management

Suggested data model (Prisma-ish):

- `User` (you, partner) — `next-auth` session for the single household.
- `Income` — `{ id, type: 'FIXED' | 'VARIABLE', source, amount, date | recurring, month }`. Fixed is global/recurring; variable is per-month.
- `Category` — `{ id, name, color (hex), isRelevant: boolean (essentials vs discretionary), monthlyLimit }`. Savings/Investments is special-cased as its own bucket (NOT lumped into essentials).
- `Card` — `{ id, name, color (hex), isCash: boolean }`. Cash color is locked green.
- `Expense` — `{ id, date, amount, categoryId, subcategory?, cardId, description, notes?, paidById, isShared }`. Derived: `myShare = isShared ? amount * 0.68 : amount` (only when paid by you).
- `CardPayment` — `{ id, date, cardId, amount }`. Distinct from Expense; excluded from spend/share aggregations.
- `Settlement` — `{ id, weekStart, weekEnd, settled }` (or derive on the fly from shared expenses in the week).

Key derived values:

- Bucket spend = sum of `myShare` for expenses whose category `isRelevant`/discretionary/savings classification.
- Bucket targets = `totalIncome * {0.5, 0.25, 0.25}` where `totalIncome = fixed + variableForMonth`.
- Category spent vs `category.monthlyLimit`.
- Settlement: `charged` (full shared amounts you fronted this week), `partnerOwes = charged * 0.32`, `trueCost = charged * 0.68`, `cardPayment = charged`.

## Design Tokens

**Card colors (payment method) — fixed, used as dots/chips/chart segments:**

- Amex Platinum `#6b7280` · Amex Gold `#c79a3b` · NU `#820ad1` · BBVA `#0b5cab` · **Cash `#16a34a` (locked, + coin icon)**
- All card colors except Cash should be **user-editable**.

**Bucket colors (50/25/25):**

- Essentials `#475569` · Discretionary `#d97706` (danger `#dc2626`) · Savings/Investments `#0d9488`

**Category colors (each category its own; can be user-pickable):**

- Rent `#4f46e5` · Groceries `#65a30d` · Utilities `#0891b2` · Eating out `#ea580c` · Fun/Entertainment `#db2777` · Transport `#7c3aed`

**Semantic:**

- Positive / share / income `#16a34a` (tint bg `#eafaf0` / `#f0fdf4`) · Danger/over `#dc2626` (tint `#fef2f2`)
- **Payment highlight**: text/accent `#2563eb` / `#1d4ed8`, background `#eff6ff`, tag bg `#dbeafe`
- Ink `#111827` · body `#374151` · muted `#6b7280` · faint `#9ca3af` · hairline `#f1f2f4` · border `#e6e8eb` · field bg `#fafbfc`

**Other:** radii ~8–12px (cards 10, fields 10, mobile sheets 24); subtle shadow `0 1px 3px rgba(0,0,0,.08)`, modal `0 12px 40px rgba(0,0,0,.16)`. Currency format: `$1,000.00 MXN`. Replace placeholder `system-ui` type with your Tailwind font scale; on 50/25/25 status keep the headline number large.

## Assets

- Icons: use **lucide-react** (eye/eye-off for privacy toggle, credit-card/banknote for payments, calendar for date, chevrons for nav, plus for add). The wireframe uses inline SVG placeholders.
- No raster images. The "coin" glyph on Cash can be a lucide icon.

## Screenshots

Per-screen PNGs in `screenshots/` (rendered from the current wireframes):

- `dashboard-desktop.png` / `dashboard-mobile.png`
- `category-detail-desktop.png` / `category-detail-mobile.png`
- `expenses-desktop.png` / `expenses-mobile.png`
- `settlement-desktop.png` / `settlement-mobile.png`
- `income-desktop.png` / `income-mobile.png`
- `add-expense-mobile.png` / `add-expense-desktop.png`
- `color-systems.png` — the card / bucket / category color legend

## Files

- `Wireframes v2 (merged direction).standalone.html` — open in a browser to view the full canvas (**V2 / source of truth**).
- `Wireframes v2 (merged direction).dc.html` — source for the above.
- `Wireframes v1 (A vs B).dc.html` — earlier two-direction exploration; **the Login design to build lives here** (V2 has no login).

## Open questions to confirm before building

1. **Eye toggle scope** — income-only, or a global app-wide privacy switch?
2. **Settlement rollup** — one payment per card, or a single weekly number across all cards?
3. **Category colors** — lock the palette above, or make each category color user-pickable like cards?
4. **Savings vs Investments** — one bucket, or tracked separately inside the 25%?
