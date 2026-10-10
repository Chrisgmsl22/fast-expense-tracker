# ADR-0025: Archiving a card retires it from Card balances, balance included

Date: 2026-10-09
Status: Accepted (owner decision, 2026-10-09)
Supersedes: the CHORE-9 plan clause that read "this display MUST still show archived cards whose balance != 0 (never hide a card you still owe on)", and the paired requirement to make archiving warn or block when a card still carries an outstanding balance
Builds on: [ADR-0020](./0020-cash-basis-money-model.md) (cash-basis money model) and [ADR-0021](./0021-partner-and-sharing-in-settings.md) §6.c, which introduced `Card.archivedAt`

## Context

CHORE-9 adds a Card balances page at `/cards`. Its job is to answer one question:
what do I owe on each card right now.

The chore's original plan said an archived card must stay on that page while its
balance is not zero, because hiding it would hide a real debt. It paired that with
a guard: archiving a card that still owes should warn or block.

The implementation did the opposite. It excludes archived cards from both the list
and the total, and the plan clause was rewritten in the same commit, so no diff
read as a decision. The owner was asked and chose the new behaviour:

> "if I archive a card, I should simply not see it on the cards section. If I have
> a pending balance, it doesn't matter, the user decided to do it."

This is not hypothetical: on the owner's own data, archived cards that still carry
balances are hidden today, and their total leaves the figure the page exists to show.

## Decision

**Archiving a card retires it from Card balances completely. The balance goes with
it.** Archiving means the card is done, not merely unused for new charges.

1. **`BALANCE_CARD_FILTER` excludes `archivedAt != null`** from both
   `listBalances` and `getHistory`, so an archived card has no tile, no drawer and
   no contribution to Total owed.
2. **No guard at archive time.** Archiving stays one click in Settings. The owner
   owns the consequence, and Restore is one click back.
3. **The exclusion is not date-aware**, so archiving also removes the card from
   every past month. See the consequence below.

## Consequences

- **Positive:** `/cards` shows only cards the owner still uses, which is what he
  wants to see. The rule is one line and has no special case for a balance that is
  nearly zero, which would need a threshold nobody can defend.
- **Nothing is lost.** Archiving sets `archivedAt`; no row is deleted. Settings
  lists archived cards with a Restore control, and restoring brings the card and
  its balance straight back.
- **Spending figures do not move.** The expenses on an archived card stay in the
  feed, the buckets, the category rollups and the 50/25/25 maths. Only the
  card-balance view drops them.
- **Negative: a past month changes retroactively.** The filter reads the card's
  current state, not its state during the month on screen. Archiving a card today
  also removes it from September, August and every earlier month, so a statement
  read last month shows a smaller total when reopened. The card did exist then and
  the debt was real. Accepted as the cost of "archived counts as deleted"; a
  point-in-time rule would be a different decision.
- **Negative: an archived card's balance is frozen.** Pickers exclude archived
  cards, so a payment cannot be logged against one without restoring it first.
- **Negative: a misclick is silent.** One click removes a balance from the total
  with no warning. Recovery needs the owner to notice and use Restore.

## Alternatives considered

- **Keep the original rule: show an archived card while its balance is not zero.**
  Rejected by the owner. It also makes the page's membership rule depend on a
  figure rather than on the card's state, so a card would appear and disappear as
  payments land.
- **Warn or block when archiving a card that still owes.** Rejected for now, on
  the same reasoning: the owner decided, and the action is reversible. Worth
  revisiting if a misclick ever costs him a real figure.
- **Make the exclusion point-in-time**, so a past month keeps the cards that were
  active during it. Not rejected on merit, but out of scope: it needs an archive
  timestamp comparison in every balance query, and it contradicts "archived counts
  as deleted" on the current month.
