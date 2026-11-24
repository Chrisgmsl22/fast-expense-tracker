# Financial export for year and month reviews

**Status:** Approved for implementation.

Download one Excel workbook from Settings and give it to an agent to review
spending, income, and budget performance. The first version supports a calendar
year or a single month. Each type of record has its own tab so an agent can
compare the numbers without counting the same money twice.

## What the user does

1. Open **Settings → Export data** and choose **Year** or **Month**.
2. Choose a period. Default to the current year or month in Mexico City.
3. Download `financial-export-2026.xlsx` or `financial-export-2026-11.xlsx`.

The current year runs from January 1 through today. Mark the current month as
partial and show the cutoff in the workbook. Past years cover all 12 months.
Filter by the date of the transaction, so a backdated transaction appears in the
period it belongs to. The workbook keeps its headings even when a tab has no rows.
The Settings controls and errors are available in Spanish and English.

## Workbook tabs

| Tab                  | Contents                                                                                                                                                                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monthly summary      | One row per covered month. Show fixed and variable income, spending, savings, and actuals and targets for each budget bucket. Use the same rules as the dashboard, including the budget split in effect that month. |
| Expenses             | One row per saved expense. Include the date, category, subcategory, card reference, full charge, stored personal share, shared flag, funding source, and partner-payment flag.                                      |
| Income               | One row per month with a configured fixed income, plus one row per variable income entry. Fixed income uses the amount in force that month.                                                                         |
| Cards                | One row per card referenced by the period's expenses or movements, including archived cards. Include a reference that matches across tabs, the card label, type, and archive status.                                |
| Payments & transfers | One row per saved movement. Include the date, movement type, amount, and card reference when present. Keep legacy entries and identify provisional partner debts as entries that moved no cash.                     |
| Guide                | Explain the export period, cutoff, currency, column meanings, and which amounts to use for each type of analysis.                                                                                                   |

Use stable English tab and column names so the same instructions work on every
export. Store amounts as numeric cells in MXN and transaction dates as
`YYYY-MM-DD`. Store user-supplied text as plain text. Keep descriptions, notes,
and free-text income labels out of the first version. Card and category labels
are included because the agent needs them to compare spending.

## How to read the numbers

- Use the saved personal share for expense totals and the full charge for
  purchase amounts on a card. A card payment is a movement and adds nothing
  to purchase spending.
- Use the monthly summary for budget comparisons. The dashboard excludes
  savings-funded and reimbursed expenses from the budget, and tracks savings
  in its own bucket. Retain those expenses in the detail tab for analysis.
- Use the income tab for the income the tracker counts toward the budget.
  A movement labeled as income remains in the movement journal. It does not
  increase dashboard income.

[Funding and settlement rules](0007-funding-source-and-settlement-cycles.md) ·
[Settings design](0006-settings-standalone-shared-modes.md)

## Implementation and acceptance

Add an authenticated download to the existing Settings screen. Resolve the
account from the session and scope every read to that account, including related
card and category data. Generate the workbook on demand and send it directly to
the browser as a private, non-cacheable download. The app adds no database writes
or schema changes. Reverting the feature removes the download without changing
stored data.

- For a completed year, the summary matches the 12 corresponding monthly
  exports, and each dated detail row appears in exactly one of those months.
- January 1 and the last day of each month belong to the correct period in
  Mexico City. The current year ends today and shows no future months.
- Income changes and the budget split match the dashboard for historical
  months. Shared expenses retain their saved split. Card payments and
  provisional debts stay out of expense totals.
- A signed-out or invalid request gets no workbook. A signed-in account can
  download only its own records. Private text fields stay out of the file.
- Verify a workbook with invented data in a browser download and open it with a
  spreadsheet reader. Verify one year and one month, an empty period, and an
  archived card referenced by a transaction.

The first release is a manual download. The year and month selectors cover the
review workflow. All-time and custom ranges, a live connection to an agent, and
an in-app agent can be considered separately.
