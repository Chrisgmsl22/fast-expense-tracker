# Application logs and product metrics

Status: Proposed.

Fast Expense Tracker has about four users, and the owner accounts for most activity. Start with a few events that can show whether someone saved an expense or hit an unexpected failure. Add a separate product metrics slice to measure whether new users reach their first expense. Keep both services on free plans.

Production browser error reporting is verified. GlitchTip grouped three synthetic browser errors under `FAST-EXPENSE-TRACKER-2`. The app currently sends exceptions through the existing Sentry SDK. It has no structured log sender, and the login action returns a generic error when sign-in throws unexpectedly. The November 23 login outage showed that gap. [Incident notes](../lessons.md#2026-11-23--missing-production-environment-variable-broke-login) · [Existing GlitchTip setup](../decisions/0014-glitchtip-replaces-sentry.md)

## Structured application logs

CHORE-45 starts with the Node.js server actions for regular expense creation and login. Enable structured logs once in the server SDK and reuse the existing GlitchTip DSN. Emit events after the action knows the result.

| Event                   | Level | When to emit                                                                                                                                 |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `expense.created`       | Info  | The app successfully persists a regular expense.                                                                                             |
| `expense.create_failed` | Error | An unexpected failure prevents the expense from being saved.                                                                                 |
| `auth.login_failed`     | Error | An unexpected application or configuration failure prevents login. Invalid credentials and validation failures remain ordinary form results. |

Keep event names and any allowlisted reason codes static. Review attributes the SDK attaches automatically. Exclude credentials, user and record IDs, financial details, free text, request bodies, and raw exception messages from structured logs. Keep the logging path best-effort so a telemetry outage cannot change a saved expense or its response. Keep existing automatic exception reporting in GlitchTip Issues.

GlitchTip's free allowance is 1,000 billable events per month. Ten log entries count as one event, and each exception counts as one event. Send selected events and keep the organization on its free plan. [GlitchTip pricing](https://glitchtip.com/pricing/)

### Coverage to add as needed

| Area                  | Candidate events                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Expense management    | Expense updated or deleted; unexpected write failure.                                             |
| Signup and onboarding | Account created, onboarding completed; unexpected provisioning failure.                           |
| Cards and transfers   | Card added or archived, payment or transfer saved; unexpected write failure.                      |
| Shared expenses       | Partner payment saved, settlement closed; a named rule blocked settlement.                        |
| Reports and exports   | Summary copied once the copy succeeds; export generated or failed when that feature is available. |
| App health            | Database timeout, missing configuration, or background job failure when relevant.                 |

### Verify log delivery

- Use invented data to test that a successful save emits one info event and that unexpected failures emit the expected error events. Exercise invalid credentials and expense validation. Verify the original action results when the log sender fails.
- Verify one labeled info entry and one labeled error entry in GlitchTip Logs through MCP. Use a controlled server smoke test. Standard Vercel Preview has no database, so a Preview transport check must avoid database-backed actions. After rollout, use the production test profile to verify a regular expense save. Reproduce failures in an isolated environment.
- Keep the smoke trigger out of the production app. No new environment variables are expected for this slice. [Deployment conventions](../conventions/deployment.md)

## Product metrics

CHORE-46 creates one funnel in a free PostHog project. It counts users who complete signup and then save their first regular expense within seven days. The seven-day window is a starting proposal. Exclude owner and test activity so the result describes the other users. The funnel starts when tracking goes live.

- Emit `signup_completed` after account provisioning commits and `expense_created` after a regular expense save commits. Use explicit server-side events.
- Derive a stable PostHog identifier on the server with a keyed HMAC over the internal account ID. Use a dedicated analytics secret. Keep raw IDs, account details, and financial data out of PostHog. Classify owner and test accounts using an app-owned server-side list, send only an `internal_traffic` boolean, and filter it out of the funnel.
- Configure a PostHog project token, host, and analytics secret for the server. Record exact variable names, which Vercel environments need them, and who sets them in the implementation PR. Use a fabricated test identity to verify event receipt, funnel membership, and the internal-traffic exclusion.
- Keep automatic click capture and session replay off. Keep the project on the no-card free plan. GlitchTip remains the place to investigate errors. [PostHog server SDK](https://posthog.com/docs/libraries/node) · [PostHog pricing](https://posthog.com/pricing)

[ADR-0014](../decisions/0014-glitchtip-replaces-sentry.md) selected GlitchTip for error tracking and deferred analytics. Before implementing this slice, record the separate product analytics decision in an ADR with the owner's sign-off.
