# CHORE-21: Summary layout redesign

Status: CHORE-21 implementation and local validation are complete on `feat/CHORE-21-summary-layout` in the main checkout. [PR #82](https://github.com/Chrisgmsl22/fast-expense-tracker/pull/82) is open for review.

Reflects plan revision 2.

The approved layout uses the existing financial totals. Outside-income labels include savings and reimbursements. The total retains its income-only scope. The footer uses stored partner shares and preserves the open settlement cycle across filters and months.

## Implemented result

- The dashboard rail shows personal cost, source proportions, allocations, the income total, and partner details.
- The Expenses footer shows the visible count, category context, open settlement, four metrics, and the existing breakdown dialog.
- The mobile footer uses a two-by-two grid. Its measured height reserves space for the final row.
- The income total, stored shares, legacy transfers, and converted-payment rules remain unchanged.
- Independent review found no Critical or Important issues. Desktop and mobile browser checks passed.
- Validation passed: 1,071 unit tests, 161 integration tests, lint, typecheck, format checks, repository guards, and the production build.

## Reference

[summaryLayout.html](./summaryLayout.html) contains the user-provided desktop and mobile mock. The repository copy substitutes invented amounts and a fictional partner name. Styles, structure, scripts, and bundled assets remain intact. The source export in Downloads remains unchanged. Bar widths remain visual examples, not calculated totals.

## Proposed visual work

- Dashboard: settlement pill, dominant monthly cost, charged subtitle, source bar, allocation row, dark total block, partner details, and breakdown link.
- Expenses: one footer with filter context, settlement band, four metrics, and breakdown access.
- Mobile: stacked dashboard summary and a fixed footer with a two-by-two metric grid. Reserve enough space so the footer cannot cover the final expense.
- Preserve the existing breakdown dialog, solo-mode rules, and open-cycle settlement scope.

## Data constraints

- `whatIReallySpent.amount` already excludes savings-funded and reimbursed expenses. The mock subtracts its outside-income figure from that value again. Do not copy that arithmetic.
- `notFromIncome.amount` includes savings and reimbursements. A savings-only label requires a separate source breakdown, or a broader accurate label.
- `total` represents money from this month's income: income-funded consumption, allocations, and applicable legacy transfers. It excludes other funding sources. The mock's explanatory note describes different semantics.
- A fixed percentage of all charges does not describe solo expenses or historical splits. Use stored shares and accurate copy.
- Expenses totals already follow the category filter. Add the visible count and filter description from the same filtered collection.
- The settlement pill represents the open cycle. Its balance does not follow the expense filters or selected historical month.
- Preserve deduplication of converted payment rows and legacy transfers. Do not derive partner share from a simple subtraction of unrelated totals.

## Expected footprint and effort

This is a medium presentation change. Likely areas: SummaryRail, SummaryStrip, the presentation model, SettlementReminder, ExpenseListInteractive, MonthFeed, and page spacing. A savings-only split may also need a domain aggregation field and its tests. No database migration or new dependency appears necessary.

Regression coverage should include income versus other sources, reimbursements, allocations, mixed and historical splits, legacy transfers, category filters, empty/solo states, negative balances, and modal agreement.

The sidebar PR contains the design reference. CHORE-21 remains a separate implementation PR, as the user requested.
