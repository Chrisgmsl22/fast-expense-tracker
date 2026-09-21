# CHORE-21: Summary layout redesign

Status: CHORE-21 is open. The user chose a separate implementation PR. This sidebar change includes the design reference only.

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

Allow approximately half to one development day for implementation, focused regression tests, independent review, and desktop/mobile browser checks. This is an estimate, not a delivery commitment.

Regression coverage should include income versus other sources, reimbursements, allocations, mixed and historical splits, legacy transfers, category filters, empty/solo states, negative balances, and modal agreement.

Recommendation: use a separate follow-up PR. The sidebar branch is already reviewed; the summary redesign affects two screens and their financial presentation. The user approved this split. Include the design reference and CHORE-21 record in the sidebar PR; implement the new summary in its own branch.
