# CHORE-20: Official sidebar navigation

Reflects plan revision 5.

The app has a horizontal desktop menu. Replace it with the approved dark sidebar from [newSidebar.html](../designs-screens/newSidebar.html).

## Scope

- Use the grouped desktop sidebar and mobile drawer from the official mock.
- Show Overview, Money, and Setup groups, the bucket-bar logo, active links, and account controls.
- Keep Add controls in page headers.
- Show the open settlement balance with direction and the existing solo-mode gate.
- Show the current CDMX month balance, day progress, and budget alerts.
- Preserve keyboard access, route behavior, session expiry, and sign-out.

## Data and period

The sidebar says “This month” and names the current CDMX month. Page filters can show another month. The settlement pill always represents the open cycle.

Reuse the dashboard summary: Really spent uses consumption spent; Saved uses savings allocated; Net so far uses the existing net amount. Refresh the sidebar after mutations and a date change. Do not change money formulas.

Alerts use existing bucket targets and effective category limits. Exclude the Savings bucket because its target is a goal. Exclude categories with zero or absent limits. Alerts preserve cents and show whether each limit belongs to a bucket or category. An empty alert list has no warning section.

## Boundaries

No new financial model, database migration, route, or dependency is required. Other screen designs remain authoritative. The earlier Option A mock is historical context only.

## Open choice

The first preview links Savings to the existing /category/savings allocation view. This is the provisional default; the user can select another destination. Preserve a valid explicit month in the link. Otherwise, use the bare route so the server reads the latest remembered month.

## Approved preview feedback

Essentials and Discretionary use a pale red card background, red border, heading, and amount when the total exceeds the target. The existing over-budget state controls this style. At or below the target, each card keeps its normal style. Savings keeps its goal color. This visual update does not change financial rules.

## Verification and status

The sidebar implementation is complete in the local branch. The full-card budget highlight is complete and passed independent review. Five existing bucket tests, lint, typecheck, format, and diff checks pass. The live browser confirms the exceeded card style. The independent reviewer approved the changes after the month-link and alert-precision fixes. No Critical or Important issue remains.

- 1,064 unit tests and 161 integration tests pass.
- Lint, typecheck, format, chore-register, and diff checks pass.
- Local browser checks confirm desktop layout, mobile drawer dismissal, focus return, navigation, month persistence, current-month labels, alert precision, and sign-out.
- Invented unit fixtures cover settlement directions, solo-mode gates, empty alerts, limit overrides, and date boundaries. These alternate data states did not require changes to local account data.
- The preview runs at http://127.0.0.1:3020/dashboard on the loopback interface.

The implementation passed review and checks. CHORE-20 is shipped and awaits merge through its PR. CHORE-21 remains open as a separate follow-up.

## Separate follow-up

CHORE-21 tracks the dashboard summary and Expenses footer redesign. This change includes its anonymized mock and scope notes only. The user chose a separate implementation PR.
