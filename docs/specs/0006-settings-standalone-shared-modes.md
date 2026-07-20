# 0006 — Settings page + standalone / shared modes + card management

**Date**: 2026-07-12
**Status**: Draft (design approved by the user in-session; implementation pending)
**Type**: Feature / product-generalization
**Chores**: CHORE-6.a → CHORE-6.b → CHORE-6.c (see [`docs/roadmap/chores.json`](../roadmap/chores.json)) — one PR each, in order (6.b and 6.c both depend on 6.a).
**Relates**: [spec 0005](./0005-cash-basis-money-model.md) (the money model this configures), the mockup at [`docs/designs-screens/Settings.html`](../designs-screens/Settings.html).
**Kicks off with**: a short ADR for sign-off — "partner identity + share become per-user Settings, not a hardcoded constant; sharing is an opt-in mode." `docs/decisions/` is protected, so write + get sign-off before code. This touches the reasoning behind [ADR-0018](../decisions/0018-money-movements-not-settlement-ritual.md)/[spec 0005](./0005-cash-basis-money-model.md)'s partner model.

> This spec is the durable record of a design session. A fresh session should be
> able to start CHORE-6 from this doc alone.

---

## 1. Problem / goal

The app is built entirely around **one** user's setup: the partner name is a
hardcoded constant (`lib/partner.ts` → `PARTNER_NAME = "Brenda"`, used in 13
files), and the shared-expense + settlement machinery is always on. Family and
friends want to use the app — some as a **plain expense tracker** (no partner, no
splitting, no settlement), some as a **shared-expense tracker** like the owner.

Two more gaps block that:

1. **No Settings UI.** `app/(dashboard)/settings/page.tsx` is an empty `<h1>`
   stub. There is nowhere to configure anything.
2. **No card management.** Cards are seeded only; you can't add, rename, recolor,
   or remove a card from the app.

The DB is already multi-user (every row is `userId`-scoped; `User`, `Settings`,
auth all exist). **Accounts are created manually** (seed script / direct prod
insert of a password hash) — there is **no public signup**, and none is in scope
(see §8). So this is not a rewrite; it is: make the partner identity data, gate
the sharing machinery behind an opt-in, and build the Settings page — including
card management — properly.

## 2. The model — two modes, one opt-in toggle

A user is in one of two modes, driven by a single Settings toggle:

| Mode       | `sharesExpenses`  | What the app shows                                                       |
| ---------- | ----------------- | ------------------------------------------------------------------------ |
| **Solo**   | `false` (default) | Plain tracker. No split control, no settlement, no partner anywhere.     |
| **Shared** | `true`            | Everything the owner uses today: split %, settlement, partner movements. |

**The toggle gates its own inputs.** When `sharesExpenses` is on, the Settings
form reveals **partner name** and **your share %** (name required when on). When
off, those fields are hidden and irrelevant. This is the single source of truth —
there is no separate "solo flag" that can drift out of sync with the name.

**Default is Solo.** New accounts are plain trackers until the owner opts in. The
existing owner account is migrated to Shared with `partnerName = "Brenda"`,
`defaultSharePercentage = 0.68` (see §5).

**Governing principle (inherited from spec 0005): store atomic facts, derive
every view.** Mode is one stored boolean; every screen derives its shape from it
at render time. No per-screen "hidden" flags.

## 3. Settings page design

Built "properly" per the reviewed mockup ([`Settings.html`](../designs-screens/Settings.html)),
desktop + mobile. Sections, top to bottom — **only two are wired live in this
chore; the rest are deferred** (§8) and either omitted or shown as clearly-labelled
"coming soon" placeholders, per the owner's call at kickoff:

| Section                                                    | This chore                                                                 |
| ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Expense split rule**                                     | ✅ **Live.** The `sharesExpenses` toggle + revealed partner name + your %. |
| **Cards**                                                  | ✅ **Live.** Full card management (§6).                                    |
| Account (email, password, sign out)                        | Deferred — sign-out may already exist in nav; leave as-is.                 |
| Preferences (currency/month, theme, language, budget rule) | Deferred (theme = separate dark-mode work).                                |
| Privacy (hide sensitive amounts)                           | Deferred.                                                                  |
| Export data                                                | Deferred.                                                                  |

The page is a server component that reads the user's `Settings`; the split-rule
block and card list are client components with server actions to persist. Follow
`docs/conventions/frontend.md` and `architecture.md` (no `db` in the component;
go through a repository/service; action orchestrates only).

## 4. Where partner identity comes from (kill the constant)

`PARTNER_NAME` is imported synchronously in 13 files. It becomes a value read from
the user's `Settings.partnerName`.

- A single accessor (e.g. `getSettings(userId)` in a settings service/repository)
  is the source; server components pass the name down as a prop. **No component
  imports a partner constant.**
- `lib/partner.ts`'s constant is removed (or kept only as the seed default for the
  owner account). The file comment already anticipates this: _"if this ever
  becomes user-configurable it moves to Settings and this constant becomes the
  default."_
- Display strings that interpolate the name ("I paid {name}", "{name} owes you",
  "Paid to {name}", "You & {name}") take the name as data. In **Solo** mode these
  strings never render (their whole surface is hidden — §5).

## 5. Data model changes

**`Settings`** (model exists) — add two fields:

```prisma
model Settings {
  // ...existing...
  sharesExpenses         Boolean @default(false) // opt-in: shared-expense mode
  partnerName            String?                 // required in UI when sharesExpenses; null in solo
  defaultSharePercentage Float   @default(0.68)  // EXISTS — only meaningful when sharesExpenses
}
```

**`Card`** — add a soft-archive field (delete would orphan `Expense[]`/`Movement[]`):

```prisma
model Card {
  // ...existing...
  archivedAt DateTime? // archived cards drop out of pickers, stay on old records
}
```

**Data migration (owner account only; low risk — no record rewrites):**
set `sharesExpenses = true`, `partnerName = "Brenda"` on the owner's `Settings`
row so the owner's experience is unchanged. New accounts default to Solo. No
expense/movement/card rows change. (Contrast spec 0005, which rewrote real
records — this one does not.)

## 6. Card management

CRUD in the Settings **Cards** section. Decisions refined at CHORE-6.c kickoff
(2026-07-19, in-session sign-off) — these supersede the original bullets:

- **Add** — name, type (`credit` | `debit` | `cash`), color. The color control is
  a **swatch picker over a shared named palette** (`lib/palette.ts` — the seeded
  colours plus a few extras, ending the seed↔login-page drift) **plus a validated
  custom `#RRGGBB` hex field** (reverses the original "no free hex" — a picker
  alone is too limiting once anyone can add cards). Palette source of truth:
  [`domain-reference.md §4`](../reference/domain-reference.md).
- **Rename / recolor** — edit an existing card. A **unique active card name per
  user** (case-insensitive) is enforced in the add/rename action; archived names
  don't collide (you may re-add a name you archived).
- **Remove — archive _or_ delete, by reference count:**
    - A card with **any** `Expense`/`Movement` references is **archived** (sets
      `archivedAt`) — a hard delete would break history (FK RESTRICT) or, if forced,
      strip the card label off every past record. Archived cards vanish from pickers
      but stay attached to history, so months/totals never break.
    - A card with **zero** references may be **hard-deleted** (added by mistake,
      never used — no data impact). The delete action **re-checks references
      server-side** and refuses if any exist.
    - **No unarchive/restore** — plain CRUD; keep the UX simple.
- **Cash is fully locked** — the always-present `type: "cash"` card cannot be
  renamed, recoloured, archived, or deleted (app-wide cash convention; green).
- **Cap: 10 active (non-archived) cards** per user (`MAX_ACTIVE_CARDS`), enforced
  in the add action. Archived cards don't count — archive an old one to free a slot.

Card reads that populate pickers filter `archivedAt: null`; reads that render
history do **not** filter (old records still resolve their card).

**Deferred to [CHORE-9](../roadmap/chores.json):** the outstanding-balance
warn/block on archive. CHORE-9 owns the per-card balance read-model and will add
(and tweak) that guard then; 6.c archives/deletes without a balance check.

## 7. Implementation phases — one chore each

Three chores, one PR each, **in order** (6.b and 6.c both depend on 6.a). Each is
an independently reviewable/shippable slice under the register's one-chore-one-PR
norm.

**CHORE-6.a — Settings foundation + configurable partner.** Schema (`Settings +2`),
settings accessor, remove `PARTNER_NAME` constant (thread name as data), build the
Settings page shell + the split-rule block (toggle → name + %), owner data
migration. Tests: settings action (validation: name required when toggle on),
accessor, form. _Foundation — 6.b and 6.c build on the flag / the page shell._

**CHORE-6.b — Solo-mode gating.** With the flag in place, hide the sharing
machinery when `sharesExpenses = false`: the shared/% control in `ExpenseForm.tsx`
(expenses save at 100% mine, `isShared:false`, `yourPercentage:1`), the
**Settlement** route + its link in `components/nav/AppNav.tsx`, the partner items
in the Add menu (`components/expense/AddExpenseButton.tsx` → the `gf_received`/
`gf_paid`/`gf_fronted` actions), and partner widgets on the dashboard. Guard the
settlement route server-side (Solo user hitting the URL directly → redirect).
Tests: each surface renders correctly in both modes; route guard. _Depends on 6.a._

**CHORE-6.c — Card management.** Schema (`Card.archivedAt`), card CRUD actions
(IDOR-safe, `userId`-scoped), Settings Cards section, picker reads filter archived.
Tests: CRUD actions, archive hides-from-picker-but-keeps-history, ownership
scoping. _Depends on 6.a (the Settings page shell)._

## 8. Out of scope / deferred

- **Public signup / onboarding.** ~~Accounts stay manually created.~~ **Superseded
  (2026-07-13):** interest from would-be users reversed this — public signup is now
  planned in **[CHORE-8](../roadmap/chores.json)**, bounded by a configurable
  `MAX_USERS` cap (default 10) enforced in PROD so onboarding stays small. Sequenced
  after CHORE-6.a/6.b. Email verification, password reset, and OAuth remain out of scope.
- **Account / Preferences / Privacy / Export sections** of the mock — visual
  placeholders or omitted this chore.
- **Theme / dark mode** — the mock now has a light/dark design, which _unblocks_
  the existing `dark-mode-toggle` backlog item, but it is separate work (needs the
  class-based theme rework).
- **Per-account default currency / locale** — MXN stays assumed; generalizing
  currency is its own effort (Phase 5 territory).

## 9. Decisions resolved in this session

- **Deployment**: manual account creation (seed / direct prod insert), no public
  signup now.
- **Solo vs shared**: an **explicit opt-in toggle** in Settings (not derived from
  name-presence, not an onboarding step). Default off. Toggle reveals + requires
  partner name and share %.
- **Owner is the primary sharer**; keep partner settings as simple as possible.
- **Card delete → archive**, not hard delete / not reassign.
- **Build the Settings page properly** (per mock) rather than a minimal
  split-rule-only form — but only wire split-rule + cards live this chore.
- **Split into three chores** (CHORE-6.a/.b/.c), one PR each, over an umbrella —
  matches the register's one-chore-one-PR norm.

## 10. Kickoff checklist (cold start)

1. Start with **CHORE-6.a**: branch off up-to-date `main`
   (`feat/CHORE-6.a-…`), set the chore `in-progress`.
2. Write the ADR (partner-as-Settings + opt-in sharing mode); get sign-off —
   `docs/decisions/` is protected. (Once, in 6.a.)
3. 6.a → PR → review → merge; then **6.b**; then **6.c** (6.b and 6.c depend on 6.a).
4. Owner-account migration (in 6.a): `sharesExpenses=true`, `partnerName="Brenda"`
   (verify on real data via Neon MCP before/after).
5. Slice lifecycle per [`slice-planning.md`](../conventions/slice-planning.md);
   `pnpm chores:status --write` on status changes.
