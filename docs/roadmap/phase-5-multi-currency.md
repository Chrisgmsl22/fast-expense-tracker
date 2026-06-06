# Phase 5: Multi-currency

**Outcome**: USD/EUR capture with MXN equivalent; reference-only foreign-amount display.
**Spec**: [`docs/specs/0001-initial-design.md` §7 — Phase 5](../specs/0001-initial-design.md)
**Slicing**: [`parallel-slicing.md`](../conventions/parallel-slicing.md) — F→I (no fan-out; work is too thin to split)

This phase activates the multi-currency columns already in the schema
(`originalAmount`, `originalCurrency` — added in slice 1.1). The
canonical-amount convention is in spec §3: `amount` is always MXN;
`originalAmount` + `originalCurrency` are reference-only.

User flow: when entering a USD expense, the user fills in the original
USD amount AND the MXN equivalent (from their bank statement). Totals
across the app continue to use `amount` (MXN) — no special cases.

Pure F → I structure since the work splits cleanly into "form changes"
and "display changes" with no useful fan-out.

## Slices

#### 5.1: Currency picker + originalAmount field `[PR]`

Adds currency picker + originalAmount input to capture/edit form.

##### Tasks

- [ ] Currency dropdown in `ExpenseForm`: MXN (default) / USD / EUR
- [ ] When currency ≠ MXN, show `originalAmount` input alongside the existing `amount` (MXN equivalent) field
- [ ] Update help text: "Original amount" and "MXN equivalent (from bank statement)"
- [ ] Update Zod schema:
    - `currency: z.enum(['MXN', 'USD', 'EUR'])` (default 'MXN')
    - `originalAmount: z.number().positive().optional()`
    - `.refine()`: if currency ≠ MXN, `originalAmount` must be present
- [ ] Server actions `createExpense` / `updateExpense` persist `originalAmount` + `originalCurrency`
- [ ] Tests: schema validation (refine), server-action paths

---

#### 5.2: Foreign-amount display + e2e `[PR]`

Updates list / summary / dashboard to show the foreign-amount pattern.

##### Tasks

- [ ] List view row: if `originalCurrency` is set, display `${originalAmount} ${originalCurrency} (${amount} MXN)`. Otherwise just `${amount} MXN`.
- [ ] Summary widgets and dashboard charts: continue using `amount` (MXN) — verify no leakage of foreign amounts into totals
- [ ] Summary header / dashboard: optionally a small note "X expenses this month in foreign currency" (decide during slice)
- [ ] Playwright e2e: log USD expense → verify list shows both currencies → verify summary uses MXN only → verify dashboard chart uses MXN only
- [ ] Tests: display logic with mocked data
