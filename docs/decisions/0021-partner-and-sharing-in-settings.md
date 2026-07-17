# ADR-0021: Partner identity + opt-in shared-expense mode live in Settings

Date: 2026-07-13
Status: Proposed (awaiting sign-off)
Supersedes: the hardcoded `PARTNER_NAME = "Brenda"` constant (`lib/partner.ts`) that [ADR-0018](./0018-money-movements-not-settlement-ritual.md) introduced as the single source for the partner's display name
Builds on: [spec 0006](../specs/0006-settings-standalone-shared-modes.md) (the durable design record; approved in-session) and the cash-basis model of [ADR-0020](./0020-cash-basis-money-model.md) / [spec 0005](../specs/0005-cash-basis-money-model.md), which this configures rather than changes

## Context

The app was built around one user's setup: the partner's name was a hardcoded
constant used in ~15 files, and the shared-expense + settlement machinery was
always on. Family and friends want to use it — some as a plain expense tracker
(no partner, no splitting, no settlement), some as a shared tracker like the
owner. The DB is already multi-user (every row is `userId`-scoped), so this is
not a rewrite; it is making the partner identity per-user data and gating the
sharing machinery behind an explicit opt-in.

Accounts are created manually (seed / direct prod insert). Public signup is out
of scope (spec 0006 §8).

## Decision

**Partner identity + sharing mode are per-user Settings, and every view derives
from them.** (Governing principle inherited from spec 0005: store atomic facts,
derive every view.)

1. **`Settings.sharesExpenses` (Boolean, default `false`) is the single source of
   truth for mode.** Solo = plain tracker; Shared = split %, settlement, partner
   movements. There is no separate "solo flag" that can drift out of sync.
2. **`Settings.partnerName` (String?) replaces the `PARTNER_NAME` constant.** The
   name is read once per request via a settings accessor (`getSettings(userId)`)
   and **threaded down as data** (props / function args). No component imports a
   partner constant. `defaultSharePercentage` (already present) is only meaningful
   in Shared mode.
3. **The toggle gates its own inputs.** When `sharesExpenses` is on, the Settings
   split-rule block reveals + requires the partner name and your share %; when
   off, they're hidden.

### Mode switching (the reversible-toggle rules)

4. **Modes flip anytime — no calendar/period lock.** A user can move between Solo
   and Shared whenever they want.
5. **History is immutable, so switching is data-safe.** Stored splits
   (`amount` / `actualExpenditure` per expense, movements) never recompute on a
   mode change — the flag only changes what the UI _derives and shows_, not the
   stored facts.
6. **Solo → Shared is additive** — no confirmation needed.
7. **Shared → Solo hides, never deletes.** Disabling sharing hides the settlement
   route + partner surfaces but removes no data. `partnerName` is **preserved**
   (not nulled) so re-enabling restores the prior setup losslessly. With live
   partner data present, a confirm dialog is warranted; an unsettled balance is
   **frozen + hidden while Solo and restored losslessly** on re-enable.
8. **In Solo mode, dashboard categories default to the Total basis** (a solo
   user's share _is_ the total). The my-share ⇄ total control itself is CHORE-7.

### Scope of _this_ chore (6.a) vs. later

- **6.a (this chore):** schema (`Settings +sharesExpenses +partnerName`), the
  `getSettings` accessor, removal of the `PARTNER_NAME` constant (name threaded as
  data), the Settings page shell + the live split-rule block, and the owner data
  migration. The confirm-on-disable dialog and the freeze/restore + gating
  machinery (decisions 7–8) are **recorded here but implemented in 6.b/6.c** —
  6.a does not build them.
- **6.b:** Solo-mode gating (hide the split control, settlement route + guard,
  partner Add-menu items, partner dashboard widgets) + the freeze/restore of an
  unsettled balance.
- **6.c:** card management (`Card.archivedAt`, CRUD in Settings).

## Consequences

- **Positive:** the app is usable by anyone; partner identity is data, not code;
  one boolean drives both modes with no drift; switching is reversible and
  lossless; the owner's experience is unchanged after the data migration.
- **Negative / cost:** ~15 files change from importing a constant to receiving a
  prop; a small display fallback (`"your partner"`) covers the brief window
  between opting in and naming the partner (Solo hides these surfaces entirely
  once 6.b lands).
- **Data migration (owner account, manual — see
  [`docs/operations/owner-shared-mode-migration.md`](../operations/owner-shared-mode-migration.md)):**
  set `sharesExpenses = true`, `partnerName = "Brenda"` on the owner's row so the
  owner stays in Shared mode. New accounts default to Solo. No expense / movement
  / card rows change.

## Alternatives considered

- **Derive mode from name-presence** (has a partner name ⇒ shared). Rejected: an
  explicit opt-in can't drift, and a user could want a name recorded without the
  splitting machinery. (spec 0006 §9.)
- **Keep the constant as the seed default.** Rejected for the app path (no
  component may import it); the name is now purely Settings data. The seed simply
  leaves new accounts in Solo.
